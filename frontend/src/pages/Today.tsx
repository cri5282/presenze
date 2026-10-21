import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCheck, CalendarX2 } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { useToast } from "../toast";
import EventCard from "../components/EventCard";
import { EmptyState, ErrorBanner } from "../components/ui";
import { addDays, allDayIncludes, fmtFullDate, greeting, localDateKey, startOfDay, timeAgo } from "../date";
import type { AttendanceStatus, EventItem } from "../types";

export default function TodayPage() {
  const { user } = useAuth();
  const { version, syncing } = useSync();
  const { push } = useToast();
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    const start = startOfDay(new Date());
    api
      .events(start, addDays(start, 1))
      .then((data) => {
        if (alive) setEvents(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Impossibile caricare gli eventi");
        setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [version, reload]);

  const timed = useMemo(() => (events ?? []).filter((event) => !event.all_day), [events]);
  const todayKey = localDateKey(new Date());
  const allDay = useMemo(
    () => (events ?? []).filter((event) => allDayIncludes(event, todayKey)),
    [events, todayKey],
  );

  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, excused: 0 };
    for (const event of timed) {
      if (event.attendance) result[event.attendance.status] += 1;
    }
    return result;
  }, [timed]);

  const unmarkedStarted = timed.filter(
    (event) => !event.attendance && new Date(event.start).getTime() <= Date.now(),
  );

  const firstName = user?.name?.split(" ")[0] || "studente";

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

  async function markAllPresent() {
    if (!unmarkedStarted.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(unmarkedStarted.map((event) => api.setAttendance(event.id, "present")));
      setReload((current) => current + 1);
      push(
        `${unmarkedStarted.length} ${unmarkedStarted.length === 1 ? "lezione segnata" : "lezioni segnate"} presente`,
      );
    } catch (err) {
      push(err instanceof Error ? err.message : "Aggiornamento non riuscito", "error");
    } finally {
      setBulkBusy(false);
      setReload((current) => current + 1);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {greeting()}, {firstName}
          </p>
          <h1>Oggi</h1>
          <p className="page-subtitle">{fmtFullDate(new Date())}</p>
        </div>
        <div className="today-stats">
          <span className="stat-chip stat-chip-ok">
            <strong>{counts.present}</strong> presenti
          </span>
          <span className="stat-chip stat-chip-bad">
            <strong>{counts.absent}</strong> assenti
          </span>
          <span className="stat-chip stat-chip-warn">
            <strong>{counts.excused}</strong> giustificati
          </span>
        </div>
      </header>

      <div className="sync-line">
        <span>
          {syncing ? "Sincronizzazione in corso…" : `Aggiornato ${timeAgo(user?.last_sync_at ?? null)}`}
        </span>
        {unmarkedStarted.length > 0 ? (
          <button
            type="button"
            className="button button-primary button-small"
            onClick={() => void markAllPresent()}
            disabled={bulkBusy}
          >
            <CheckCheck size={16} />
            {bulkBusy ? "Salvataggio…" : `Segna tutti presenti (${unmarkedStarted.length})`}
          </button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      {allDay.length > 0 ? (
        <div className="allday-row">
          <span className="allday-label">Tutto il giorno</span>
          {allDay.map((event) => (
            <span key={event.id} className="allday-chip" title={event.title}>
              {event.title}
            </span>
          ))}
        </div>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Lezioni</h2>
          {events ? <span className="section-count">{timed.length}</span> : null}
        </div>

        {events === null ? (
          <div className="skeleton-list" aria-hidden="true">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : timed.length === 0 ? (
          <EmptyState icon={<CalendarX2 size={26} />} title={error ? "Eventi non disponibili" : "Nessuna lezione oggi"}>
            {error
              ? "Riprova tra poco o controlla la sincronizzazione."
              : "Gli eventi del tuo Google Calendar compariranno qui automaticamente."}
          </EmptyState>
        ) : (
          <div className="event-list">
            {timed.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                busy={busyId === event.id || bulkBusy}
                onSet={(status) => void setStatus(event, status)}
                onClear={() => void clearStatus(event)}
                onSaveTimes={(entry, exit) => saveTimes(event, entry, exit)}
              />
            ))}
          </div>
        )}
      </section>

      {!syncing && !events?.length && !error ? (
        <p className="hint">
          <CalendarCheck size={15} /> Se il calendario è vuoto, controlla di aver selezionato il
          calendario giusto nelle impostazioni.
        </p>
      ) : null}
    </div>
  );
}
