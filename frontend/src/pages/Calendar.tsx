import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { api } from "../api";
import { useSync } from "../sync";
import { useToast } from "../toast";
import EventCard from "../components/EventCard";
import { EmptyState, ErrorBanner } from "../components/ui";
import {
  addDays,
  addMonths,
  dateKeyToDate,
  fmtDayLong,
  fmtMonth,
  isToday,
  localDateKey,
  monthGrid,
  startOfDay,
  startOfMonth,
  WEEKDAYS,
} from "../date";
import type { AttendanceStatus, EventItem } from "../types";

const DOT_ORDER = ["absent", "excused", "present", "unmarked"] as const;
type DotStatus = (typeof DOT_ORDER)[number];

function dayDots(events: EventItem[]): { dots: DotStatus[]; allDay: boolean } {
  const statuses = new Set<DotStatus>();
  let allDay = false;
  for (const event of events) {
    if (event.all_day) {
      allDay = true;
    } else {
      statuses.add(event.attendance?.status ?? "unmarked");
    }
  }
  return { dots: DOT_ORDER.filter((status) => statuses.has(status)), allDay };
}

export default function CalendarPage() {
  const { version } = useSync();
  const { push } = useToast();
  const [view, setView] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => localDateKey(new Date()));
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const grid = useMemo(() => monthGrid(view), [view]);
  const rangeStart = grid[0];
  const rangeEnd = addDays(grid[41], 1);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .events(rangeStart, rangeEnd)
      .then((data) => {
        if (alive) setEvents(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Impossibile caricare il calendario");
        setEvents([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, version, reload]);

  const byDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const day of grid) {
      const dayStart = startOfDay(day);
      const dayEnd = addDays(dayStart, 1);
      const dayEvents = (events ?? []).filter((event) => {
        // Per gli eventi "tutto il giorno" le date sono pure (senza fuso): vanno
        // confrontate con la mezzanotte locale, altrimenti l'evento "sfora" nel
        // giorno successivo a causa della conversione da UTC.
        const eventStart = event.all_day
          ? new Date(`${event.start.slice(0, 10)}T00:00:00`)
          : new Date(event.start);
        const eventEnd = event.all_day
          ? new Date(`${event.end.slice(0, 10)}T00:00:00`)
          : new Date(event.end);
        return eventStart < dayEnd && eventEnd > dayStart;
      });
      if (dayEvents.length) map.set(localDateKey(day), dayEvents);
    }
    return map;
  }, [events, grid]);

  const selectedEvents = byDay.get(selectedKey) ?? [];

  function changeMonth(delta: number) {
    const next = addMonths(view, delta);
    setView(next);
    setSelectedKey(localDateKey(startOfMonth(next)));
  }

  function goToday() {
    setView(startOfMonth(new Date()));
    setSelectedKey(localDateKey(new Date()));
  }

  function selectDay(key: string) {
    setSelectedKey(key);
    if (window.matchMedia("(max-width: 1100px)").matches) {
      window.requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function setStatus(event: EventItem, status: AttendanceStatus) {
    const previous = events;
    setBusyId(event.id);
    setEvents((current) =>
      current
        ? current.map((item) =>
            item.id === event.id
              ? {
                  ...item,
                  attendance: {
                    status,
                    note: item.attendance?.note ?? null,
                    entry_time: item.attendance?.entry_time ?? null,
                    exit_time: item.attendance?.exit_time ?? null,
                    updated_at: new Date().toISOString(),
                  },
                }
              : item,
          )
        : current,
    );
    try {
      const updated = await api.setAttendance(event.id, status);
      setEvents((current) =>
        current ? current.map((item) => (item.id === updated.id ? updated : item)) : current,
      );
    } catch (err) {
      setEvents(previous);
      push(err instanceof Error ? err.message : "Aggiornamento non riuscito", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function clearStatus(event: EventItem) {
    const previous = events;
    setBusyId(event.id);
    setEvents((current) =>
      current
        ? current.map((item) => (item.id === event.id ? { ...item, attendance: null } : item))
        : current,
    );
    try {
      await api.clearAttendance(event.id);
    } catch (err) {
      setEvents(previous);
      push(err instanceof Error ? err.message : "Aggiornamento non riuscito", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function saveTimes(
    event: EventItem,
    entryTime: string | null,
    exitTime: string | null,
  ): Promise<boolean> {
    const attendance = event.attendance;
    if (!attendance) return false;

    const previous = events;
    setBusyId(event.id);
    setEvents((current) =>
      current
        ? current.map((item) =>
            item.id === event.id && item.attendance
              ? {
                  ...item,
                  attendance: {
                    ...item.attendance,
                    entry_time: entryTime,
                    exit_time: exitTime,
                    updated_at: new Date().toISOString(),
                  },
                }
              : item,
          )
        : current,
    );
    try {
      const updated = await api.setAttendance(event.id, attendance.status, {
        entry_time: entryTime,
        exit_time: exitTime,
      });
      setEvents((current) =>
        current ? current.map((item) => (item.id === updated.id ? updated : item)) : current,
      );
      return true;
    } catch (err) {
      setEvents(previous);
      push(err instanceof Error ? err.message : "Aggiornamento non riuscito", "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Vista mensile</p>
          <h1>Calendario</h1>
          <p className="page-subtitle">Tocca un giorno per vedere e segnare le lezioni.</p>
        </div>
      </header>

      {error ? <ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      <div className="calendar-layout">
        <section className="calendar-card">
          <div className="calendar-toolbar">
            <div className="calendar-title">
              <CalendarDays size={19} />
              <h2>{fmtMonth(view)}</h2>
            </div>
            <div className="calendar-actions">
              <button type="button" className="button button-ghost button-small" onClick={goToday}>
                Oggi
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Mese precedente"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Mese successivo"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {grid.map((day) => {
              const key = localDateKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const { dots, allDay } = dayDots(dayEvents);
              const outside = day.getMonth() !== view.getMonth();
              const selected = key === selectedKey;
              const preview = dayEvents.find((event) => !event.all_day) ?? dayEvents[0];
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    "day-cell",
                    outside ? "outside" : "",
                    selected ? "selected" : "",
                    isToday(day) ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectDay(key)}
                  aria-pressed={selected}
                  aria-label={`${fmtDayLong(day)}, ${dayEvents.length} eventi`}
                >
                  <span className="day-number">{day.getDate()}</span>
                  <span className="day-dots">
                    {allDay ? <span className="dot dot-allday" /> : null}
                    {dots.map((status) => (
                      <span key={status} className={`dot dot-${status}`} />
                    ))}
                  </span>
                  {preview ? <span className="day-preview">{preview.title}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="calendar-legend">
            <span>
              <i className="dot dot-present" /> Presente
            </span>
            <span>
              <i className="dot dot-absent" /> Assente
            </span>
            <span>
              <i className="dot dot-excused" /> Giustificato
            </span>
            <span>
              <i className="dot dot-unmarked" /> Da segnare
            </span>
          </div>
        </section>

        <aside className="day-panel" ref={panelRef}>
          <div className="day-panel-head">
            <div>
              <p className="eyebrow">Dettaglio</p>
              <h2>{fmtDayLong(dateKeyToDate(selectedKey))}</h2>
            </div>
            {selectedEvents.length > 0 ? (
              <span className="badge">{selectedEvents.length}</span>
            ) : null}
          </div>

          {events === null ? (
            <div className="skeleton-list" aria-hidden="true">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          ) : selectedEvents.length === 0 ? (
            <EmptyState icon={<PartyPopper size={24} />} title="Nessuna lezione">
              Giorno libero: goditelo.
            </EmptyState>
          ) : (
            <div className="event-list">
              {selectedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  compact
                  busy={busyId === event.id}
                  onSet={(status) => void setStatus(event, status)}
                  onClear={() => void clearStatus(event)}
                  onSaveTimes={(entry, exit) => saveTimes(event, entry, exit)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
