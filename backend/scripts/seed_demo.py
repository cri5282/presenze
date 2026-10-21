"""Popola il database con un utente demo e lezioni di esempio.

Uso (dalla cartella backend):
    .venv/bin/python scripts/seed_demo.py

Stampa un token di sessione da usare come cookie `presenze_session` per provare l'UI
senza Google OAuth. Non usare in produzione.
"""

from datetime import datetime, time, timedelta
from pathlib import Path
from sys import path
from zoneinfo import ZoneInfo

path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.models import Attendance, Event, User, utcnow  # noqa: E402
from app.security import create_session_token  # noqa: E402

ROME = ZoneInfo("Europe/Rome")
DEMO_EMAIL = "demo@presenze.local"


def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    day = datetime.now(ROME).date() + timedelta(days=day_offset)
    return datetime.combine(day, time(hour, minute), tzinfo=ROME).astimezone(ZoneInfo("UTC"))


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if existing:
            db.delete(existing)
            db.commit()

        user = User(
            google_sub="demo-user",
            email=DEMO_EMAIL,
            name="Mario Rossi",
            selected_calendars=["primary"],
            last_sync_at=utcnow(),
        )
        db.add(user)
        db.flush()

        lessons = [
            # oggi
            (0, 8, 30, 10, 0, "Matematica", "Aula 3B", "present"),
            (0, 10, 15, 11, 45, "Fisica", "Laboratorio", "absent"),
            (0, 12, 0, 13, 0, "Inglese", "Aula 1A", None),
            (0, 14, 0, 16, 0, "Informatica", "Lab. informatico", None),
            # settimana scorsa
            (-3, 8, 30, 10, 0, "Matematica", "Aula 3B", "present"),
            (-3, 10, 15, 11, 45, "Fisica", "Laboratorio", "present"),
            (-4, 9, 0, 11, 0, "Informatica", "Lab. informatico", "present"),
            (-5, 11, 0, 13, 0, "Inglese", "Aula 1A", "absent"),
            (-6, 8, 30, 10, 0, "Matematica", "Aula 3B", "present"),
            (-7, 14, 0, 16, 0, "Storia", "Aula 2C", "excused"),
            # prossimi giorni
            (1, 8, 30, 10, 0, "Matematica", "Aula 3B", None),
            (1, 10, 15, 11, 45, "Fisica", "Laboratorio", None),
            (2, 9, 0, 11, 0, "Informatica", "Lab. informatico", None),
            (3, 11, 0, 13, 0, "Inglese", "Aula 1A", None),
        ]

        for offset, sh, sm, eh, em, title, location, status in lessons:
            start = at(offset, sh, sm)
            end = at(offset, eh, em)
            event = Event(
                user_id=user.id,
                calendar_id="primary",
                google_event_id=f"demo-{title}-{offset}-{sh}-{sm}",
                title=title,
                location=location,
                start=start,
                end=end,
                all_day=False,
                status="confirmed",
            )
            db.add(event)
            db.flush()
            if status:
                db.add(
                    Attendance(
                        user_id=user.id,
                        event_id=event.id,
                        status=status,
                    )
                )

        all_day = Event(
            user_id=user.id,
            calendar_id="primary",
            google_event_id="demo-allday",
            title="Open Day orientamento",
            start=datetime.combine(
                datetime.now(ROME).date(), time(0, 0), tzinfo=ZoneInfo("UTC")
            ),
            end=datetime.combine(
                datetime.now(ROME).date() + timedelta(days=1), time(0, 0), tzinfo=ZoneInfo("UTC")
            ),
            all_day=True,
            status="confirmed",
        )
        db.add(all_day)
        db.commit()

        print(f"Utente demo creato: {DEMO_EMAIL} (id {user.id})")
        print(f"Token di sessione:\n{create_session_token(user.id)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
