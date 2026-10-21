from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Attendance, Event, User, utcnow
from ..schemas import GroupStats, StatsOut

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsOut)
def stats(
    from_: datetime = Query(alias="from"),
    to: datetime = Query(alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatsOut:
    start = from_ if from_.tzinfo else from_.replace(tzinfo=timezone.utc)
    end = to if to.tzinfo else to.replace(tzinfo=timezone.utc)
    start, end = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    if end <= start:
        raise HTTPException(status_code=400, detail="Intervallo non valido")

    rows = db.execute(
        select(Event, Attendance)
        .outerjoin(Attendance, Attendance.event_id == Event.id)
        .where(
            Event.user_id == user.id,
            Event.all_day.is_(False),
            Event.start < end,
            Event.end > start,
        )
        .order_by(Event.start)
    ).all()

    now = utcnow()
    totals = {"present": 0, "absent": 0, "unmarked": 0}
    groups: dict[str, dict[str, int]] = defaultdict(
        lambda: {"present": 0, "absent": 0, "unmarked": 0}
    )
    labels: dict[str, str] = {}

    for event, attendance in rows:
        key = event.title.strip().casefold() or "(senza titolo)"
        labels.setdefault(key, event.title.strip() or "(Senza titolo)")
        group = groups[key]
        if attendance is not None:
            status = attendance.status
            if status not in ("present", "absent"):
                status = "absent"
            totals[status] += 1
            group[status] += 1
        elif event.end < now:
            totals["unmarked"] += 1
            group["unmarked"] += 1

    marked = totals["present"] + totals["absent"]
    total = marked + totals["unmarked"]
    rate = round(totals["present"] / marked * 100, 1) if marked else 0.0

    group_stats: list[GroupStats] = []
    for key, group in groups.items():
        g_marked = group["present"] + group["absent"]
        g_total = g_marked + group["unmarked"]
        if g_total == 0:
            continue
        group_stats.append(
            GroupStats(
                title=labels[key],
                present=group["present"],
                absent=group["absent"],
                unmarked=group["unmarked"],
                total=g_total,
                rate=round(group["present"] / g_marked * 100, 1) if g_marked else 0.0,
            )
        )

    group_stats.sort(key=lambda item: (-item.total, item.title.casefold()))

    return StatsOut(
        range_from=start,
        range_to=end,
        present=totals["present"],
        absent=totals["absent"],
        unmarked=totals["unmarked"],
        marked=marked,
        total=total,
        rate=rate,
        groups=group_stats,
    )
