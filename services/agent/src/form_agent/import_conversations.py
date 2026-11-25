"""Offline cutover. Read one exported Platform source row per JSON line from stdin."""

import argparse
import json
import os
import sys
import time
from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy import insert, select, text

from form_agent.business.conversations.model import (
    fingerprint,
    make_delivery,
    public_result,
    stable_id,
)
from form_agent.business.conversations.store import (
    conversations,
    postgres_engine,
    turns,
)
from form_agent.business.form_authoring.task_facts import FormAuthoringTaskFacts


def imported_values(row):
    cid = str(row["id"])
    revision = int(row["revision"])
    if revision != len(row["turns"]):
        raise ValueError(f"Source revision and turn count differ for {cid}")
    facts = FormAuthoringTaskFacts(
        pending_message=row["document"] if revision == 0 else None
    )
    imported = []
    for seq, old in enumerate(row["turns"], 1):
        message, result = old["message"], old["result"]
        tid = old.get("turnId") or stable_id("turn", cid, str(seq))
        base = old.get("baseText")
        doc = row["document"] if seq == 1 else message
        projection = deepcopy(result)
        trace = projection.get("requirements_trace") or {}
        standard = trace.get("standard") or {}
        for item in [*standard.get("requirements", []), *standard.get("issues", [])]:
            for source in item.get("sources", []):
                key = source["source_id"]
                if key.startswith("history:"):
                    source["source_id"] = (
                        f"turn:{max(0, seq - 1 - 20) + int(key.split(':')[1]) // 2 + 1}"
                    )
        facts.advance(cid, seq, message, doc, base, projection)
        public = {"turnId": tid, "message": message, "result": public_result(result)}
        delivery = None
        if result["kind"] == "proposal":
            # The Platform migration preserves the original draft business id.
            facts.draft_id = cid
            public["draftId"] = cid
            delivery = make_delivery(cid, tid, seq, result, cid, base, None, None, None)
        request = {"message": message, "turnId": tid, "revision": seq - 1}
        if base is not None:
            request["workingText"] = base
        if seq == 1:
            request["document"] = row["document"]
        # The new gateway fingerprints the normalized business command. The
        # original source only distinguishes values that were actually retained.
        request["requestFingerprint"] = "sha256:" + fingerprint(
            [
                seq - 1,
                message,
                request.get("document"),
                None,
                None,
                None,
                None,
                base,
            ]
        )
        imported.append(
            dict(
                conversation_id=cid,
                turn_id=tid,
                revision=seq,
                status="done",
                fingerprint=fingerprint(
                    [
                        seq - 1,
                        message,
                        None,
                        None,
                        request["requestFingerprint"],
                    ]
                ),
                request=request,
                public_turn=public,
                private_result=result,
                delivery=delivery,
            )
        )
    # In-progress user edits and names are Platform draft data and are migrated
    # by the business-side transaction. Keep the checked reference candidate here.
    stamp = row.get("updated_at") or row.get("created_at")
    if not stamp:
        raise ValueError("Source updated_at is required")
    when = datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).astimezone(UTC)
    header = dict(
        id=cid,
        user_id=row["user_id"],
        space_id=row["space_id"],
        title=(row["turns"][0]["message"] if row["turns"] else row["document"])[:60],
        revision=revision,
        import_digest=fingerprint(row),
        updated_at=when,
        task=facts.model_dump(mode="json", exclude_none=True),
        form_id=row.get("form_id"),
        work_id=row.get("version_id"),
    )
    return header, imported


def migrate_row(conn, source, verify):
    header, expected_turns = imported_values(source)
    cid = header["id"]
    existing = (
        conn.execute(select(conversations).where(conversations.c.id == cid))
        .mappings()
        .first()
    )
    if existing is None:
        if verify:
            raise ValueError(f"Missing imported conversation {cid}")
        conn.execute(insert(conversations).values(**header))
        for item in expected_turns:
            conn.execute(insert(turns).values(**item))
    persisted = (
        conn.execute(select(conversations).where(conversations.c.id == cid))
        .mappings()
        .one()
    )
    for key, value in header.items():
        actual = persisted[key]
        if key == "updated_at" and actual.tzinfo is None:
            actual = actual.replace(tzinfo=UTC)
        if actual != value:
            raise ValueError(f"Imported conversation differs at {cid} {key}")
    actual_rows = (
        conn.execute(
            select(turns)
            .where(turns.c.conversation_id == cid)
            .order_by(turns.c.revision)
        )
        .mappings()
        .all()
    )
    if [dict(t) for t in actual_rows] != expected_turns:
        raise ValueError(f"Imported conversation history differs for {cid}")
    return {
        "id": cid,
        "sourceDigest": header["import_digest"],
        "revision": header["revision"],
        "publicTurns": len(actual_rows),
        **(
            {
                "deliveries": [
                    t["delivery"] for t in actual_rows if t["delivery"] is not None
                ]
            }
            if verify
            else {}
        ),
    }


def hold_cutover(engine):
    from form_agent.business.conversations.store import CUTOVER_LOCK

    deadline = time.monotonic() + 30
    with engine.connect() as conn:
        while True:
            acquired = conn.execute(
                text(f"SELECT pg_try_advisory_lock({CUTOVER_LOCK})")
            ).scalar()
            conn.commit()
            if acquired:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    "Agent conversation store is busy; cutover was not started"
                )
            time.sleep(0.2)
        print("READY", flush=True)
        try:
            sys.stdin.buffer.read()
        finally:
            conn.execute(text(f"SELECT pg_advisory_unlock({CUTOVER_LOCK})"))
            conn.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true")
    mode.add_argument("--hold-cutover", action="store_true")
    options = parser.parse_args()
    engine = postgres_engine(os.environ["AGENT_DATABASE_URL"])
    try:
        if options.hold_cutover:
            hold_cutover(engine)
            return
        for line in sys.stdin:
            if line.strip():
                with engine.begin() as conn:
                    report = migrate_row(conn, json.loads(line), options.verify)
                print(json.dumps(report), flush=True)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
