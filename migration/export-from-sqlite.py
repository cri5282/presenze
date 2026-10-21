#!/usr/bin/env python3
"""Esporta il vecchio database SQLite in un JSON importabile su Firebase.

Lo script legge il database reale creato dalla versione FastAPI e produce un
file con utenti, eventi e presenze. Il file non va committato: contiene dati
personali. Viene letto da `scripts/bootstrap-firebase.mjs` per popolare
Firestore e Firebase Authentication.

Uso:
    python3 migration/export-from-sqlite.py
    python3 migration/export-from-sqlite.py --db backend/data/presenze.db \
        --out migration/firebase-export.json
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def iso(value: str | None) -> str | None:
    if not value:
        return None
    # SQLite contiene datetime UTC naive, senza suffisso di fuso.
    if value.endswith("Z") or "+" in value[10:]:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="backend/data/presenze.db")
    parser.add_argument("--out", default="migration/firebase-export.json")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise SystemExit(f"Database non trovato: {db_path}")

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    users = [dict(row) for row in con.execute("SELECT * FROM users ORDER BY id")]
    events = [dict(row) for row in con.execute("SELECT * FROM events ORDER BY start, id")]
    attendance = [
        dict(row)
        for row in con.execute(
            """
            SELECT a.*, u.username
            FROM attendance a
            JOIN users u ON u.id = a.user_id
            ORDER BY a.id
            """
        )
    ]
    con.close()

    by_id = {user["id"]: user for user in users}
    admin = next((user for user in users if user["role"] == "admin"), None)
    if admin is None:
        raise SystemExit("Nessun amministratore nel database")

    export = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": str(db_path),
        "admin": {
            "username": admin["username"],
            "name": admin["name"],
            "calendar_ids": json.loads(admin["selected_calendars"] or '["primary"]'),
            "last_sync_at": iso(admin["last_sync_at"]),
        },
        "users": [
            {
                "username": user["username"],
                "name": user["name"],
                "role": user["role"],
                "active": bool(user["is_active"]),
                "must_change_password": bool(user["must_change_password"]),
                "created_at": iso(user["created_at"]),
            }
            for user in users
            if user["role"] != "admin"
        ],
        "events": [
            {
                "legacy_id": event["id"],
                "google_event_id": event["google_event_id"],
                "calendar_id": event["calendar_id"],
                "title": event["title"],
                "description": event["description"],
                "location": event["location"],
                "start": iso(event["start"]),
                "end": iso(event["end"]),
                "all_day": bool(event["all_day"]),
                "status": event["status"],
                "html_link": event["html_link"],
                "updated_at": iso(event["updated_at"]),
            }
            for event in events
        ],
        "attendance": [
            {
                "username": row["username"],
                "legacy_event_id": row["event_id"],
                "status": row["status"],
                "note": row["note"],
                "entry_time": row["entry_time"],
                "exit_time": row["exit_time"],
                "updated_at": iso(row["updated_at"]),
            }
            for row in attendance
        ],
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Esportati {len(export['users'])} utenti, {len(export['events'])} eventi "
        f"e {len(export['attendance'])} presenze in {out}"
    )


if __name__ == "__main__":
    main()
