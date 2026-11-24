"""Normalize replay identity of imported user turns to the conversation gateway."""

import json
from hashlib import sha256

from alembic import op
from sqlalchemy import text

revision = "0004_imported_turn_fingerprints"
down_revision = "0003_conversation_tombstones"
branch_labels = None
depends_on = None


def digest(value):
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return sha256(payload.encode()).hexdigest()


def normalize(conn):
    # Frozen Agent cutover lock. Scope the data change to the importer's native
    # row shape; every post-cutover gateway request has a required context.
    if not conn.execute(text("SELECT pg_try_advisory_xact_lock(17018,1)")).scalar():
        raise RuntimeError("Conversation activity in progress; retry this migration")
    query = text("""
        SELECT t.conversation_id, t.turn_id, t.revision, t.fingerprint, t.request,
               t.public_turn->>'message' AS public_message, t.status
        FROM agent_conversation_turns t JOIN agent_conversations c ON c.id=t.conversation_id
        WHERE c.import_digest IS NOT NULL AND NOT (t.request ? 'context')
        ORDER BY t.conversation_id, t.revision FOR UPDATE OF t
    """)
    rows = conn.execute(query).mappings().all()
    changed = 0
    for row in rows:
        req = row["request"]
        tid, cid = row["turn_id"], row["conversation_id"]
        index, message = row["revision"] - 1, row["public_message"]
        if (
            row["status"] != "done"
            or req.get("turnId") != tid
            or req.get("revision") != index
            or req.get("message") != message
            or not isinstance(message, str)
            or set(req)
            - {
                "turnId",
                "revision",
                "message",
                "workingText",
                "document",
                "requestFingerprint",
            }
        ):
            raise RuntimeError(f"Unexpected imported command shape at {cid}/{tid}")
        former = req.get("requestFingerprint") or {
            k: req.get(k)
            for k in ("workingText", "draftId", "draftRevision", "document")
        }
        if row["fingerprint"] != digest([index, message, None, None, former]):
            raise RuntimeError(f"Imported command fingerprint mismatch at {cid}/{tid}")
        new_key = "sha256:" + digest(
            [
                index,
                message,
                req.get("document"),
                None,
                None,
                None,
                None,
                req.get("workingText"),
            ]
        )
        if req.get("requestFingerprint") == new_key:
            continue
        signature = digest([index, message, None, None, new_key])
        updated = conn.execute(
            text("""
            UPDATE agent_conversation_turns
            SET fingerprint=:signature,
                request=jsonb_set(request,'{requestFingerprint}',to_jsonb(CAST(:new_key AS text)),true)
            WHERE conversation_id=:cid AND turn_id=:tid AND fingerprint=:prior
        """),
            {
                "signature": signature,
                "new_key": new_key,
                "cid": cid,
                "tid": tid,
                "prior": row["fingerprint"],
            },
        )
        if updated.rowcount != 1:
            raise RuntimeError("Imported turn changed during normalization")
        changed += 1
    return len(rows), changed


def upgrade():
    normalize(op.get_bind())


def downgrade():
    raise RuntimeError(
        "Old optional request values cannot be reconstructed from canonical turn identities"
    )
