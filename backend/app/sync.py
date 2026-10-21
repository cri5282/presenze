import logging
import threading
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import google
from .config import settings
from .models import CalendarSync, Event, User, utcnow
from .schemas import SyncResult
from .security import decrypt_token, encrypt_token

logger = logging.getLogger("presenze.sync")
_sync_lock = threading.Lock()


def _parse_time(value: dict | None) -> tuple[datetime, bool] | None:
    if not value:
        return None
    if "dateTime" in value:
        raw = value["dateTime"].replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc), False
    if "date" in value:
        d = date.fromisoformat(value["date"])
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc), True
    return None


def _apply_item(db: Session, user: User, calendar_id: str, item: dict) -> bool:
    google_id = item.get("id")
    if not google_id:
        return False

    existing = db.scalar(
        select(Event).where(
            Event.user_id == user.id,
            Event.calendar_id == calendar_id,
            Event.google_event_id == google_id,
        )
    )

    if item.get("status") == "cancelled":
        if existing:
            db.delete(existing)
            return True
        return False

    start_info = _parse_time(item.get("start"))
    end_info = _parse_time(item.get("end"))
    if not start_info:
        return False
    start, all_day = start_info
    end = end_info[0] if end_info else start + timedelta(hours=1)

    title = (item.get("summary") or "").strip() or "(Senza titolo)"
    values = {
        "title": title[:500],
        "description": (item.get("description") or None),
        "location": (item.get("location") or None),
        "start": start,
        "end": end,
        "all_day": all_day,
        "status": item.get("status") or "confirmed",
        "html_link": item.get("htmlLink"),
    }

    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        return True

    db.add(
        Event(
            user_id=user.id,
            calendar_id=calendar_id,
            google_event_id=google_id,
            **values,
        )
    )
    return True


def _sync_calendar(
    db: Session, user: User, access_token: str, calendar_id: str, *, retry: bool = True
) -> int:
    state = db.scalar(
        select(CalendarSync).where(
            CalendarSync.user_id == user.id, CalendarSync.calendar_id == calendar_id
        )
    )
    if state is None:
        state = CalendarSync(user_id=user.id, calendar_id=calendar_id)
        db.add(state)
        db.flush()

    now = utcnow()
    time_min = now - timedelta(days=settings.initial_sync_days_back)
    time_max = now + timedelta(days=settings.initial_sync_days_forward)
    sync_token = state.sync_token
    page_token: str | None = None
    processed = 0

    try:
        while True:
            page = google.list_events(
                access_token,
                calendar_id,
                sync_token=sync_token,
                time_min=time_min if not sync_token else None,
                time_max=time_max if not sync_token else None,
                page_token=page_token,
            )
            for item in page.get("items", []):
                if _apply_item(db, user, calendar_id, item):
                    processed += 1
            db.commit()

            page_token = page.get("nextPageToken")
            if not page_token:
                next_token = page.get("nextSyncToken")
                if next_token:
                    state.sync_token = next_token
                state.last_sync_at = utcnow()
                db.commit()
                break
    except google.GoogleError as exc:
        db.rollback()
        if exc.expired and sync_token and retry:
            logger.info("Sync token scaduto per %s: risincronizzazione completa", calendar_id)
            state.sync_token = None
            db.commit()
            return _sync_calendar(db, user, access_token, calendar_id, retry=False)
        raise

    return processed


def sync_user(db: Session, user: User) -> SyncResult:
    """Serializza le sync: evita doppie scritture tra background e richiesta manuale."""
    if not _sync_lock.acquire(blocking=False):
        return SyncResult(
            ok=False,
            errors=["Sincronizzazione già in corso, riprova tra qualche secondo"],
            last_sync_at=user.last_sync_at,
        )
    try:
        return _sync_user(db, user)
    finally:
        _sync_lock.release()


def _sync_user(db: Session, user: User) -> SyncResult:
    if not google.is_configured():
        return SyncResult(ok=False, errors=["Google OAuth non configurato sul server"])

    if not user.refresh_token_enc:
        user.needs_reauth = True
        db.commit()
        return SyncResult(ok=False, errors=["Nessun token Google salvato: effettua di nuovo l'accesso"])

    refresh_token = decrypt_token(user.refresh_token_enc)
    if not refresh_token:
        user.needs_reauth = True
        db.commit()
        return SyncResult(ok=False, errors=["Token Google non leggibile: effettua di nuovo l'accesso"])

    try:
        access_token = google.refresh_access_token(refresh_token)
    except google.GoogleError as exc:
        if exc.invalid_grant:
            user.needs_reauth = True
            db.commit()
        return SyncResult(ok=False, errors=[str(exc)], last_sync_at=user.last_sync_at)

    calendars = user.selected_calendars or ["primary"]
    processed = 0
    synced = 0
    errors: list[str] = []

    for calendar_id in calendars:
        try:
            processed += _sync_calendar(db, user, access_token, calendar_id)
            synced += 1
        except google.GoogleError as exc:
            logger.warning("Sync calendario %s fallita: %s", calendar_id, exc)
            errors.append(f"{calendar_id}: {exc}")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Errore inatteso sincronizzando %s", calendar_id)
            db.rollback()
            errors.append(f"{calendar_id}: errore inatteso")

    user.last_sync_at = utcnow()
    if synced:
        user.needs_reauth = False
    db.commit()

    return SyncResult(
        ok=synced > 0,
        events_processed=processed,
        calendars_synced=synced,
        errors=errors,
        last_sync_at=user.last_sync_at,
    )


def store_refresh_token(user: User, refresh_token: str | None) -> None:
    if refresh_token:
        user.refresh_token_enc = encrypt_token(refresh_token)
        user.needs_reauth = False


def sync_due_users() -> None:
    """Eseguita nel threadpool: sincronizza gli utenti la cui ultima sync è scaduta."""
    from .db import SessionLocal

    db = SessionLocal()
    try:
        cutoff = utcnow() - timedelta(minutes=settings.sync_interval_minutes)
        users = db.scalars(
            select(User).where(
                User.refresh_token_enc.is_not(None),
                User.needs_reauth.is_(False),
                (User.last_sync_at.is_(None)) | (User.last_sync_at < cutoff),
            )
        ).all()
        for user in users:
            try:
                result = sync_user(db, user)
                if not result.ok and result.errors:
                    logger.warning("Sync utente %s: %s", user.id, result.errors)
            except Exception:  # noqa: BLE001
                logger.exception("Sync utente %s fallita", user.id)
                db.rollback()
    finally:
        db.close()
