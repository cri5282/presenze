from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Attendance, Event, User
from ..schemas import AttendanceIn, AttendanceOut, EventOut

router = APIRouter(tags=["events"])


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def event_out(event: Event) -> EventOut:
    attendance = event.attendance
    return EventOut(
        id=event.id,
        google_event_id=event.google_event_id,
        calendar_id=event.calendar_id,
        title=event.title,
        description=event.description,
        location=event.location,
        start=event.start,
        end=event.end,
        all_day=event.all_day,
        status=event.status,
        html_link=event.html_link,
        attendance=AttendanceOut.model_validate(attendance) if attendance else None,
    )


def _get_event(db: Session, user: User, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento non trovato")
    return event


def _validate_times(entry_time: str | None, exit_time: str | None) -> None:
    if entry_time and exit_time and entry_time >= exit_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'orario di uscita deve essere successivo a quello di entrata",
        )


@router.get("/events", response_model=list[EventOut])
def list_events(
    from_: datetime = Query(alias="from"),
    to: datetime = Query(alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventOut]:
    start, end = _to_utc(from_), _to_utc(to)
    if end <= start:
        raise HTTPException(status_code=400, detail="Intervallo non valido")
    events = db.scalars(
        select(Event)
        .where(Event.user_id == user.id, Event.start < end, Event.end > start)
        .order_by(Event.start)
    ).all()
    return [event_out(event) for event in events]


@router.put("/events/{event_id}/attendance", response_model=EventOut)
def set_attendance(
    event_id: int,
    payload: AttendanceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventOut:
    event = _get_event(db, user, event_id)
    if event.all_day:
        raise HTTPException(status_code=400, detail="Gli eventi di tutto il giorno non si registrano")

    attendance = event.attendance
    if attendance is None:
        attendance = Attendance(user_id=user.id, event_id=event.id)
        event.attendance = attendance

    fields = payload.model_fields_set
    attendance.status = payload.status
    if "note" in fields:
        attendance.note = payload.note
    if "entry_time" in fields:
        attendance.entry_time = payload.entry_time
    if "exit_time" in fields:
        attendance.exit_time = payload.exit_time

    _validate_times(attendance.entry_time, attendance.exit_time)

    db.commit()
    db.refresh(event)
    return event_out(event)


@router.delete("/events/{event_id}/attendance", status_code=status.HTTP_204_NO_CONTENT)
def clear_attendance(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    event = _get_event(db, user, event_id)
    if event.attendance is not None:
        db.delete(event.attendance)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
