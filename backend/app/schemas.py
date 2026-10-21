from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AttendanceStatus = Literal["present", "absent"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    picture: str | None = None
    selected_calendars: list[str] = Field(default_factory=list)
    needs_reauth: bool = False
    last_sync_at: datetime | None = None


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: AttendanceStatus
    note: str | None = None
    entry_time: str | None = None
    exit_time: str | None = None
    updated_at: datetime


class EventOut(BaseModel):
    id: int
    google_event_id: str
    calendar_id: str
    title: str
    description: str | None = None
    location: str | None = None
    start: datetime
    end: datetime
    all_day: bool
    status: str
    html_link: str | None = None
    attendance: AttendanceOut | None = None


class AttendanceIn(BaseModel):
    status: AttendanceStatus
    note: str | None = Field(default=None, max_length=2000)
    # Orari locali facoltativi, in formato HH:MM. Se il campo è omesso resta il
    # valore già salvato; se è null viene cancellato.
    entry_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    exit_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class CalendarOut(BaseModel):
    id: str
    summary: str
    primary: bool = False
    background_color: str | None = None


class SettingsIn(BaseModel):
    calendar_ids: list[str] = Field(min_length=1, max_length=30)


class SyncResult(BaseModel):
    ok: bool
    events_processed: int = 0
    calendars_synced: int = 0
    errors: list[str] = Field(default_factory=list)
    last_sync_at: datetime | None = None


class GroupStats(BaseModel):
    title: str
    present: int
    absent: int
    unmarked: int
    total: int
    rate: float


class StatsOut(BaseModel):
    range_from: datetime
    range_to: datetime
    present: int
    absent: int
    unmarked: int
    marked: int
    total: int
    rate: float
    groups: list[GroupStats]
