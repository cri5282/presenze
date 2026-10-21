import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import google
from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..models import Attendance, CalendarSync, Event, User
from ..schemas import CalendarOut, SettingsIn, SyncResult, UserOut
from ..security import decrypt_token
from ..sync import sync_user

router = APIRouter(tags=["account"])
logger = logging.getLogger("presenze.account")


def _refresh_token(user: User) -> str:
    if not user.refresh_token_enc:
        raise HTTPException(status_code=401, detail="Google non collegato: effettua di nuovo l'accesso")
    token = decrypt_token(user.refresh_token_enc)
    if not token:
        raise HTTPException(status_code=401, detail="Token Google non valido: effettua di nuovo l'accesso")
    return token


def _access_token(user: User, db: Session) -> str:
    try:
        return google.refresh_access_token(_refresh_token(user))
    except google.GoogleError as exc:
        if exc.invalid_grant:
            user.needs_reauth = True
            db.commit()
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/calendars", response_model=list[CalendarOut])
def calendars(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[CalendarOut]:
    if not google.is_configured():
        raise HTTPException(status_code=503, detail="Google OAuth non configurato sul server")
    try:
        items = google.list_calendars(_access_token(user, db))
    except google.GoogleError as exc:
        if exc.invalid_grant:
            user.needs_reauth = True
            db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CalendarOut(**item) for item in items]


@router.put("/settings", response_model=UserOut)
def update_settings(
    payload: SettingsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    new_ids = list(dict.fromkeys(cid.strip() for cid in payload.calendar_ids if cid.strip()))
    if not new_ids:
        raise HTTPException(status_code=400, detail="Seleziona almeno un calendario")
    old_ids = set(user.selected_calendars or ["primary"])
    removed = old_ids - set(new_ids)

    if removed:
        events = db.scalars(
            select(Event).where(Event.user_id == user.id, Event.calendar_id.in_(removed))
        ).all()
        for event in events:
            db.delete(event)
        states = db.scalars(
            select(CalendarSync).where(
                CalendarSync.user_id == user.id, CalendarSync.calendar_id.in_(removed)
            )
        ).all()
        for state in states:
            db.delete(state)

    user.selected_calendars = new_ids
    db.commit()
    db.refresh(user)
    return user


@router.post("/sync", response_model=SyncResult)
def sync_now(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SyncResult:
    return sync_user(db, user)


@router.delete("/account")
def delete_account(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> JSONResponse:
    """Cancella l'account e tutti i dati collegati.

    Il token Google viene revocato prima di eliminare la riga utente. Se la
    revoca fallisce (rete, token già scaduto), la cancellazione locale procede
    comunque: l'utente ha diritto a eliminare i propri dati.
    """
    if user.refresh_token_enc:
        token = decrypt_token(user.refresh_token_enc)
        if token:
            try:
                google.revoke_token(token)
            except google.GoogleError as exc:
                logger.warning("Revoca del token Google non riuscita durante la cancellazione: %s", exc)

    # Cancellazione esplicita: i vincoli ON DELETE CASCADE di SQLite ci sono,
    # ma così il comportamento è chiaro anche su altri database.
    db.execute(delete(Attendance).where(Attendance.user_id == user.id))
    db.execute(delete(Event).where(Event.user_id == user.id))
    db.execute(delete(CalendarSync).where(CalendarSync.user_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()

    response = JSONResponse({"ok": True})
    response.delete_cookie(settings.cookie_name, path="/")
    return response
