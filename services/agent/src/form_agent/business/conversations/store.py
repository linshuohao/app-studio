"""Short transactions for task/history and a session lock across graph execution."""

import asyncio
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
    and_,
    create_engine,
    delete,
    func,
    insert,
    select,
    text,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.pool import NullPool

from form_agent.business.conversations.model import (
    Message,
    Owner,
    fingerprint,
    make_delivery,
    public_result,
    stable_id,
)
from form_agent.business.conversations.references import FormReference
from form_agent.business.form_authoring.task_facts import FormAuthoringTaskFacts
from form_agent.execution.journal import COMPILER_REPLAY_PREFIX
from form_agent.integrations.protocol_store import DRIVER, connection_args

metadata = MetaData()
doc = JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")
conversations = Table(
    "agent_conversations",
    metadata,
    Column("id", Text, primary_key=True),
    Column("user_id", Text, nullable=False),
    Column("space_id", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("form_id", Text),
    Column("work_id", Text),
    Column("revision", Integer, nullable=False),
    Column("task", doc, nullable=False),
    Column("import_digest", Text),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
Index(
    "ix_agent_conversation_owner",
    conversations.c.space_id,
    conversations.c.user_id,
    conversations.c.updated_at,
)
turns = Table(
    "agent_conversation_turns",
    metadata,
    Column(
        "conversation_id",
        ForeignKey("agent_conversations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("turn_id", Text, primary_key=True),
    Column("revision", Integer),
    Column("fingerprint", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("request", doc, nullable=False),
    Column("public_turn", doc),
    Column("private_result", doc),
    Column("delivery", doc),
    UniqueConstraint("conversation_id", "revision"),
)


journal_entries = Table(
    "agent_turn_journal",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("conversation_id", Text, nullable=False),
    Column("turn_id", Text, nullable=False),
    Column("kind", Text, nullable=False),
    Column("step_key", Text),
    Column("payload", doc, nullable=False),
    ForeignKeyConstraint(
        ["conversation_id", "turn_id"],
        [
            "agent_conversation_turns.conversation_id",
            "agent_conversation_turns.turn_id",
        ],
        ondelete="CASCADE",
    ),
)
Index(
    "ix_agent_turn_journal_lookup",
    journal_entries.c.conversation_id,
    journal_entries.c.turn_id,
    journal_entries.c.step_key,
    journal_entries.c.id,
)


def reply_batches(result):
    paragraphs = [
        result.get("summary") or result.get("message") or result.get("reason"),
        *result.get("questions", []),
    ]
    return [
        {"type": "text_delta", "delta": ("\n\n" if index else "") + paragraph}
        for index, paragraph in enumerate(filter(None, paragraphs))
    ]


class TurnJournal:
    def __init__(self, conn, cid, tid):
        self.conn, self.cid, self.tid = conn, cid, tid
        self.lock = asyncio.Lock()

    async def write(self, operation):
        def transaction():
            with self.conn.begin():
                return operation()

        async with self.lock:
            return await db_step(transaction)

    def append(self, kind, key, payload):
        self.conn.execute(
            insert(journal_entries).values(
                conversation_id=self.cid,
                turn_id=self.tid,
                kind=kind,
                step_key=key,
                payload=payload,
            )
        )

    async def begin(self, key, kind, request):
        def lookup():
            result = self.conn.execute(
                select(journal_entries.c.payload)
                .where(
                    journal_entries.c.conversation_id == self.cid,
                    journal_entries.c.turn_id == self.tid,
                    journal_entries.c.step_key == key,
                    journal_entries.c.kind == "result",
                )
                .order_by(journal_entries.c.id.desc())
                .limit(1)
            ).scalar_one_or_none()
            if result is None:
                self.append(kind, key, request)
            return result

        return await self.write(lookup)

    async def completed_repair_rounds(self, compiler_scope: str = "") -> int:
        key = journal_entries.c.step_key
        scope = (
            key.startswith(compiler_scope)
            if compiler_scope
            else ~key.startswith(COMPILER_REPLAY_PREFIX)
        )
        return await self.write(
            lambda: self.conn.execute(
                select(func.count())
                .select_from(journal_entries)
                .where(
                    journal_entries.c.conversation_id == self.cid,
                    journal_entries.c.turn_id == self.tid,
                    journal_entries.c.kind == "result",
                    key.endswith(":repair"),
                    scope,
                )
            ).scalar_one()
        )

    async def finish(self, key, value):
        await self.write(lambda: self.append("result", key, {"value": value}))

    async def failure(self, key, payload):
        await self.write(lambda: self.append("failure", key, payload))

    async def partial(self, key, text):
        await self.write(lambda: self.append("partial", key, {"text": text}))

    async def event(self, event):
        await self.write(lambda: self.append("public", None, event))

    async def interrupt(self, reason, *, trace_id=None, elapsed_ms=None):
        def save():
            changed = self.conn.execute(
                update(turns)
                .where(
                    turns.c.conversation_id == self.cid,
                    turns.c.turn_id == self.tid,
                    turns.c.status == "running",
                )
                .values(status="failed")
            )
            if changed.rowcount:
                if elapsed_ms is not None:
                    self.append("duration", None, {"elapsedMs": elapsed_ms})
                event = {"type": "interruption", "reason": reason}
                if trace_id is not None:
                    event["traceId"] = trace_id
                self.append("public", None, event)

        await self.write(save)


deleted_ids = Table(
    "agent_deleted_conversations", metadata, Column("id", Text, primary_key=True)
)


CUTOVER_LOCK = "17018,1"


class StoreUnavailable(Exception):
    pass


class MissingConversation(Exception):
    pass


class ConversationConflict(Exception):
    pass


async def db_step(function, *args):
    """Wait for a short SQL operation to settle before releasing its connection."""
    operation = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(operation)
    except asyncio.CancelledError:
        await operation
        raise


def postgres_engine(dsn: str):
    return create_engine(DRIVER, connect_args=connection_args(dsn), poolclass=NullPool)


def owned(cid: str, owner: Owner):
    return (
        (conversations.c.id == cid)
        & (conversations.c.user_id == owner.user)
        & (conversations.c.space_id == owner.space)
    )


def view(row, history):
    timestamp = row["updated_at"]
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return {
        "id": row["id"],
        "title": row["title"],
        "revision": row["revision"],
        "updatedAt": timestamp.isoformat(),
        **({"formId": row["form_id"]} if row["form_id"] else {}),
        **({"workId": row["work_id"]} if row["work_id"] else {}),
        **(
            {"pendingInput": row["task"]["pending_message"]}
            if row["revision"] == 0 and row.get("task", {}).get("pending_message")
            else {}
        ),
        "turns": history,
    }


def history_for(conn: Connection, cid: str, revision: int | None = None):
    q = select(turns.c.public_turn).where(
        turns.c.conversation_id == cid, turns.c.status == "done"
    )
    if revision is not None:
        q = q.where(turns.c.revision <= revision)
    return list(conn.execute(q.order_by(turns.c.revision)).scalars())


def required(conn: Connection, cid: str, owner: Owner):
    row = (
        conn.execute(select(conversations).where(owned(cid, owner))).mappings().first()
    )
    if row is None:
        raise MissingConversation()
    return row


class ConversationStore:
    def __init__(self, engine: Engine):
        self.engine = engine

    async def read(self, fn: Callable):
        def query():
            with self.engine.connect().execution_options(
                isolation_level="REPEATABLE READ"
            ) as conn:
                if not conn.execute(
                    text(f"SELECT pg_try_advisory_xact_lock_shared({CUTOVER_LOCK})")
                ).scalar():
                    raise StoreUnavailable("Agent data is in maintenance")
                return fn(conn)

        return await asyncio.to_thread(query)

    async def list(
        self,
        owner: Owner,
        form: str | None,
        work: str | None,
        linked_draft: str | None = None,
    ):
        def query(conn):
            q = select(
                conversations.c.id,
                conversations.c.title,
                conversations.c.revision,
                conversations.c.updated_at,
                conversations.c.form_id,
                conversations.c.work_id,
            ).where(
                conversations.c.user_id == owner.user,
                conversations.c.space_id == owner.space,
            )
            if form or work:
                filters = [(conversations.c.form_id == form)] if form else []
                if work:
                    filters.append(conversations.c.work_id == work)
                scope = and_(*filters)
                if form and work and linked_draft:
                    scope |= (
                        (conversations.c.form_id.is_(None))
                        & (conversations.c.work_id.is_(None))
                        & (conversations.c.task["draft_id"].as_string() == linked_draft)
                    )
                q = q.where(scope)
            return [
                {k: v for k, v in view(row, []).items() if k != "turns"}
                for row in conn.execute(
                    q.order_by(conversations.c.updated_at.desc(), conversations.c.id)
                ).mappings()
            ]

        return await self.read(query)

    async def get(
        self,
        cid: str,
        owner: Owner,
        form: str | None = None,
        work: str | None = None,
        linked_draft: str | None = None,
    ):
        def query(conn):
            row = required(conn, cid, owner)
            if (form and row["form_id"] != form) or (work and row["work_id"] != work):
                if not (
                    form
                    and work
                    and linked_draft
                    and not row["form_id"]
                    and not row["work_id"]
                    and row["task"].get("draft_id") == linked_draft
                ):
                    raise MissingConversation()
            return self.detail(conn, row)

        return await self.read(query)

    def detail(self, conn, row):
        cid = row["id"]
        detail = view(row, history_for(conn, cid, row["revision"]))
        events = {}
        interruptions = {}
        elapsed = {}
        for tid, kind, event in conn.execute(
            select(
                journal_entries.c.turn_id,
                journal_entries.c.kind,
                journal_entries.c.payload,
            )
            .where(
                journal_entries.c.conversation_id == cid,
                journal_entries.c.kind.in_(("public", "duration")),
            )
            .order_by(journal_entries.c.id)
        ):
            if kind == "duration":
                elapsed[tid] = elapsed.get(tid, 0) + event["elapsedMs"]
            elif event["type"] == "interruption":
                interruptions[tid] = event
            else:
                events.setdefault(tid, []).append(event)
        attempts = []
        for tid, req, status in conn.execute(
            select(turns.c.turn_id, turns.c.request, turns.c.status)
            .where(turns.c.conversation_id == cid)
            .order_by(turns.c.revision, turns.c.turn_id)
        ):
            if status == "done" and tid not in events and tid not in elapsed:
                continue
            if status == "running" and conn.dialect.name == "postgresql":
                idle = conn.execute(
                    text(
                        """SELECT NOT EXISTS (
                            SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted
                            AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
                            AND classid=((hashtextextended(:cid,13) >> 32) & 4294967295)::oid
                            AND objid=(hashtextextended(:cid,13) & 4294967295)::oid
                            AND objsubid=1 AND mode='ExclusiveLock'
                        )"""
                    ),
                    {"cid": cid},
                ).scalar_one()
                if idle:
                    status = "interrupted"
            interrupted = status in ("interrupted", "failed")
            interruption = interruptions.get(tid, {}) if status == "failed" else {}
            reason = (
                interruption.get("reason", "执行进程已结束，未留下具体原因。")
                if status == "failed"
                else "执行进程已停止，未留下结束记录。"
            )
            attempts.append(
                {
                    "turnId": tid,
                    **{
                        k: req[k]
                        for k in ("draftId", "draftRevision", "readOnly")
                        if req.get(k) is not None
                    },
                    "message": req.get("message", ""),
                    **(
                        {
                            "references": [
                                {k: v for k, v in item.items() if k != "text"}
                                for item in req["references"]
                            ]
                        }
                        if req.get("references")
                        else {}
                    ),
                    "status": "interrupted" if interrupted else status,
                    "resumable": interrupted and req.get("revision") == row["revision"],
                    **({"interruptionReason": reason} if interrupted else {}),
                    **({"elapsedMs": elapsed[tid]} if tid in elapsed else {}),
                    **(
                        {"interruptionTraceId": interruption["traceId"]}
                        if "traceId" in interruption
                        else {}
                    ),
                    "events": events.get(tid, []),
                }
            )
        detail["attempts"] = attempts
        return detail

    async def saved_request(self, cid, tid, owner):
        def query(conn):
            required(conn, cid, owner)
            request = conn.execute(
                select(turns.c.request).where(
                    turns.c.conversation_id == cid, turns.c.turn_id == tid
                )
            ).scalar_one_or_none()
            if request is None:
                raise MissingConversation()
            return Message.model_validate(request)

        return await self.read(query)

    async def delivery(self, cid: str, tid: str, owner: Owner):
        def query(conn):
            required(conn, cid, owner)
            value = conn.execute(
                select(turns.c.delivery).where(
                    turns.c.conversation_id == cid, turns.c.turn_id == tid
                )
            ).scalar()
            if not value:
                raise MissingConversation()
            return value

        return await self.read(query)

    @asynccontextmanager
    async def exclusive(self, cid: str):
        opening = asyncio.create_task(asyncio.to_thread(self.engine.connect))
        try:
            conn = await asyncio.shield(opening)
        except asyncio.CancelledError:
            conn = await opening
            await db_step(conn.close)
            raise
        try:

            def lock():
                with conn.begin():
                    if not conn.execute(
                        text(f"SELECT pg_try_advisory_lock_shared({CUTOVER_LOCK})")
                    ).scalar():
                        raise StoreUnavailable("Agent data is in maintenance")
                    if not conn.execute(
                        text("SELECT pg_try_advisory_lock(hashtextextended(:key,13))"),
                        {"key": cid},
                    ).scalar():
                        raise ConversationConflict("Conversation has an active turn")

            await db_step(lock)
            yield conn
        finally:

            def release():
                try:
                    conn.rollback()
                    # Both session locks are owned exclusively by this store checkout.
                    conn.execute(text("SELECT pg_advisory_unlock_all()"))
                    conn.commit()
                finally:
                    conn.close()

            await db_step(release)

    async def rename(self, cid: str, owner: Owner, title: str):
        async with self.exclusive(cid) as conn:

            def rename():
                with conn.begin():
                    row = (
                        conn.execute(
                            update(conversations)
                            .where(owned(cid, owner))
                            .values(title=title)
                            .returning(conversations.c.id, conversations.c.title)
                        )
                        .mappings()
                        .first()
                    )
                    if row is None:
                        raise MissingConversation()
                    return dict(row)

            return await db_step(rename)

    async def remove(self, cid: str, owner: Owner):
        async with self.exclusive(cid) as conn:

            def remove():
                with conn.begin():
                    required(conn, cid, owner)
                    conn.execute(insert(deleted_ids).values(id=cid))
                    conn.execute(delete(turns).where(turns.c.conversation_id == cid))
                    conn.execute(delete(conversations).where(owned(cid, owner)))

            await db_step(remove)

    def prepare(
        self,
        conn: Connection,
        cid: str,
        owner: Owner,
        message: Message,
        check_environment: str | None = None,
    ) -> dict[str, Any]:
        tid = str(message.turnId)
        request = message.model_dump(mode="json", exclude_none=True)
        if not message.references:
            request.pop("references")
        if not message.readOnly:
            request.pop("readOnly", None)
        signature = fingerprint(
            [
                message.revision,
                message.message,
                message.context.formId,
                message.context.workId,
                message.requestFingerprint
                or {
                    **{
                        k: request.get(k)
                        for k in ("workingText", "draftId", "draftRevision", "document")
                    },
                    **({"readOnly": True} if message.readOnly else {}),
                    **(
                        {
                            "references": [
                                ref.versionId
                                if isinstance(ref, FormReference)
                                and ref.pointer is None
                                else ref.model_dump(
                                    exclude={
                                        "text",
                                        "name",
                                        "versionName",
                                        "savedAt",
                                        "objectLabel",
                                    },
                                    exclude_none=True,
                                )
                                for ref in message.references
                            ]
                        }
                        if message.references
                        else {}
                    ),
                },
            ]
        )
        key = (turns.c.conversation_id == cid) & (turns.c.turn_id == tid)
        with conn.begin():
            row = (
                conn.execute(select(conversations).where(conversations.c.id == cid))
                .mappings()
                .first()
            )
            if not row:
                if (
                    message.revision != 0
                    or conn.execute(
                        select(deleted_ids.c.id).where(deleted_ids.c.id == cid)
                    ).first()
                ):
                    raise MissingConversation()
                conn.execute(
                    insert(conversations).values(
                        id=cid,
                        user_id=owner.user,
                        space_id=owner.space,
                        title=message.message.strip()[:60],
                        revision=0,
                        task={},
                        form_id=message.context.formId,
                        work_id=message.context.workId,
                        updated_at=datetime.now(UTC),
                    )
                )
            row = required(conn, cid, owner)
            record = conn.execute(select(turns).where(key)).mappings().first()
            if record:
                if record["fingerprint"] != signature:
                    raise ConversationConflict("Turn key reused with different input")
                if record["status"] == "done":
                    return {"replay": self.envelope(conn, row, record["delivery"])}
                # Resume uses the original user input and pinned draft.
                message = Message.model_validate(record["request"])
            if (
                row["form_id"] != message.context.formId
                or row["work_id"] != message.context.workId
            ):
                if (
                    not row["form_id"]
                    and not row["work_id"]
                    and message.context.formId
                    and message.context.workId
                    and message.draftId
                    and row["task"].get("draft_id") == str(message.draftId)
                ):
                    conn.execute(
                        update(conversations)
                        .where(owned(cid, owner))
                        .values(
                            form_id=message.context.formId,
                            work_id=message.context.workId,
                        )
                    )
                else:
                    raise ConversationConflict("Conversation context changed")
            if row["revision"] != message.revision:
                raise ConversationConflict("Conversation revision changed")
            conn.execute(
                update(turns)
                .where(
                    turns.c.conversation_id == cid,
                    turns.c.turn_id != tid,
                    turns.c.status == "running",
                )
                .values(status="failed")
            )
            if record is None:
                conn.execute(
                    insert(turns).values(
                        conversation_id=cid,
                        turn_id=tid,
                        request=request,
                        fingerprint=signature,
                        status="running",
                    )
                )
            else:
                conn.execute(update(turns).where(key).values(status="running"))
            facts = FormAuthoringTaskFacts.model_validate(row["task"])
            if (
                facts.draft_id
                and str(message.draftId) != facts.draft_id
                and (
                    message.draftId
                    or (not message.readOnly and not message.context.formId)
                )
            ):
                raise ConversationConflict("Open the bound draft to request changes")
            compiler_scope = ""
            if (
                check_environment
                and check_environment != message.context.check_environment
            ):
                compiler_scope = (
                    COMPILER_REPLAY_PREFIX + fingerprint(check_environment) + ":"
                )
                message = message.model_copy(
                    update={
                        "context": message.context.model_copy(
                            update={"check_environment": check_environment}
                        )
                    }
                )
            return {
                "compiler_scope": compiler_scope,
                "message": message,
                "facts": facts,
                "input": facts.graph_input(cid, message, history_for(conn, cid)),
            }

    def envelope(self, conn, row, delivery):
        result = {"conversation": self.detail(conn, row)}
        if delivery is not None:
            result["delivery"] = delivery
        return result

    def finish(
        self,
        conn: Connection,
        cid: str,
        owner: Owner,
        message: Message,
        facts: FormAuthoringTaskFacts,
        base: str | None,
        result: dict,
        elapsed_ms: int | None = None,
    ):
        revision = message.revision + 1
        tid = str(message.turnId)
        if message.context.formId:
            result.pop("partial_draft", None)
        facts.advance(cid, revision, message.message, message.document, base, result)
        committed_at = datetime.now(UTC)
        public = {
            "createdAt": committed_at.isoformat(),
            "turnId": tid,
            "message": message.message,
            "result": public_result(result),
        }
        if message.references:
            public["references"] = [
                reference.public() for reference in message.references
            ]
        delivery = None
        if result["kind"] == "proposal" or result.get("partial_draft"):
            draft = (
                str(message.draftId)
                if message.draftId
                else facts.draft_id or stable_id("draft", cid, "form")
            )
            delivery = make_delivery(
                cid,
                tid,
                revision,
                result,
                draft,
                base,
                message.draftRevision,
                message.context.formId,
                message.context.workId,
                message.context.check_environment,
            )
            public["draftId"] = draft
            facts.draft_id = draft
            if message.context.formId:
                public["formId"] = message.context.formId
        with conn.begin():
            row = required(conn, cid, owner)
            if row["revision"] != message.revision:
                raise ConversationConflict("Conversation changed during execution")
            if (
                delivery
                and result["kind"] == "proposal"
                and delivery["candidateText"] == base
            ):
                # Showing an existing verified proposal reuses its immutable delivery.
                latest = conn.execute(
                    select(turns.c.delivery)
                    .where(
                        turns.c.conversation_id == cid, turns.c.delivery.is_not(None)
                    )
                    .order_by(turns.c.revision.desc())
                    .limit(1)
                ).scalar()
                if latest and all(
                    latest.get(k) == delivery.get(k)
                    for k in (
                        "target",
                        "draftId",
                        "digest",
                        "checkEnvironment",
                        "formId",
                        "workId",
                        "draftIssues",
                    )
                ):
                    delivery = latest
            journal = TurnJournal(conn, cid, tid)
            if elapsed_ms is not None:
                journal.append("duration", None, {"elapsedMs": elapsed_ms})
            batches = reply_batches(result)
            chunks = []
            for event in conn.execute(
                select(journal_entries.c.payload)
                .where(
                    journal_entries.c.conversation_id == cid,
                    journal_entries.c.turn_id == tid,
                    journal_entries.c.kind == "public",
                )
                .order_by(journal_entries.c.id)
            ).scalars():
                if event["type"] == "text_reset":
                    chunks.clear()
                elif event["type"] == "text_delta":
                    chunks.append(event["delta"])
            if chunks:
                sent = "".join(chunks)
                final = "".join(batch["delta"] for batch in batches)
                if final.startswith(sent):
                    batches = (
                        [{"type": "text_delta", "delta": final[len(sent) :]}]
                        if len(final) > len(sent)
                        else []
                    )
                else:
                    batches.insert(0, {"type": "text_reset"})
            for batch in batches:
                journal.append("public", None, batch)
            conn.execute(
                update(turns)
                .where(turns.c.conversation_id == cid, turns.c.turn_id == tid)
                .values(
                    revision=revision,
                    public_turn=public,
                    private_result=result,
                    delivery=delivery,
                    status="done",
                )
            )
            conn.execute(
                update(conversations)
                .where(owned(cid, owner))
                .values(
                    revision=revision,
                    task=facts.model_dump(mode="json", exclude_none=True),
                    updated_at=committed_at,
                )
            )
            return self.envelope(conn, required(conn, cid, owner), delivery), batches
