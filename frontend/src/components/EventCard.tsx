import { Check, Clock3, ExternalLink, FileText, MapPin, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { fmtTime } from "../date";
import { isCancelled, type AttendanceStatus, type EventItem } from "../types";

const OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: typeof Check;
}[] = [
  { value: "present", label: "Presente", icon: Check },
  { value: "absent", label: "Assente", icon: X },
  { value: "excused", label: "Giustificato", icon: FileText },
];

function timeValue(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

interface Props {
  event: EventItem;
  onSet: (status: AttendanceStatus) => void;
  onClear: () => void;
  onSaveTimes: (entryTime: string | null, exitTime: string | null) => Promise<boolean>;
  busy?: boolean;
  compact?: boolean;
}

export default function EventCard({
  event,
  onSet,
  onClear,
  onSaveTimes,
  busy = false,
  compact = false,
}: Props) {
  const active = event.attendance?.status;
  const cancelled = isCancelled(event);
  const isPast = new Date(event.end).getTime() < Date.now();
  const time = event.all_day ? "Tutto il giorno" : fmtTime(event.start);
  const end = event.all_day ? "" : fmtTime(event.end);

  const [editorOpen, setEditorOpen] = useState(false);
  const [entryTime, setEntryTime] = useState(event.attendance?.entry_time ?? "");
  const [exitTime, setExitTime] = useState(event.attendance?.exit_time ?? "");
  const [timeError, setTimeError] = useState<string | null>(null);

  const savedEntry = event.attendance?.entry_time ?? "";
  const savedExit = event.attendance?.exit_time ?? "";
  const hasTimes = Boolean(savedEntry || savedExit);
  const lateEntry = Boolean(
    savedEntry && !event.all_day && timeValue(savedEntry) > timeValue(time),
  );
  const earlyExit = Boolean(
    savedExit && !event.all_day && timeValue(savedExit) < timeValue(end),
  );

  useEffect(() => {
    setEntryTime(event.attendance?.entry_time ?? "");
    setExitTime(event.attendance?.exit_time ?? "");
  }, [event.attendance?.entry_time, event.attendance?.exit_time]);

  useEffect(() => {
    if (active !== "present") setEditorOpen(false);
  }, [active]);

  function openEditor() {
    setEntryTime(savedEntry);
    setExitTime(savedExit);
    setTimeError(null);
    setEditorOpen(true);
  }

  async function saveTimes(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const entry = entryTime || null;
    const exit = exitTime || null;
    if (entry && exit && entry >= exit) {
      setTimeError("L'orario di uscita deve essere successivo a quello di entrata.");
      return;
    }
    setTimeError(null);
    const saved = await onSaveTimes(entry, exit);
    if (saved) setEditorOpen(false);
  }

  async function removeTimes() {
    const saved = await onSaveTimes(null, null);
    if (saved) {
      setEntryTime("");
      setExitTime("");
      setEditorOpen(false);
    }
  }

  return (
    <article
      className={[
        "event-card",
        event.all_day ? "all-day" : "",
        cancelled ? "is-cancelled" : "",
        active ? `attendance-${active}` : "",
        compact ? "compact" : "",
        isPast && !active && !cancelled ? "is-unmarked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="event-time" aria-hidden={event.all_day}>
        <span className="event-time-main">{time}</span>
        {end ? <span className="event-time-end">{end}</span> : null}
      </div>

      <div className="event-body">
        <div className="event-heading">
          <h3 title={event.title}>{event.title}</h3>
          <div className="event-badges">
            {cancelled ? (
              <span className="badge badge-cancelled">Annullata</span>
            ) : isPast && !active && !event.all_day ? (
              <span className="badge badge-warn">Da segnare</span>
            ) : null}
            {event.html_link ? (
              <a
                className="icon-link"
                href={event.html_link}
                target="_blank"
                rel="noreferrer"
                title="Apri in Google Calendar"
              >
                <ExternalLink size={15} />
              </a>
            ) : null}
          </div>
        </div>

        <div className="event-meta">
          {event.location ? (
            <span>
              <MapPin size={13} /> {event.location}
            </span>
          ) : null}
          {event.description ? (
            <span className="event-description" title={event.description}>
              {event.description}
            </span>
          ) : null}
        </div>

        {!event.all_day && !cancelled ? (
          <>
            <div className="status-group" role="group" aria-label={`Presenza per ${event.title}`}>
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = active === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`status-button status-${option.value}${isActive ? " active" : ""}`}
                    aria-pressed={isActive}
                    disabled={busy}
                    title={isActive ? "Tocca di nuovo per annullare" : undefined}
                    onClick={() => (isActive ? onClear() : onSet(option.value))}
                  >
                    <Icon size={15} strokeWidth={2.6} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            {active === "present" ? (
              <div className="times-block">
                {hasTimes ? (
                  <div className="times-summary">
                    <Clock3 size={14} />
                    <span className="times-label">Orario effettivo</span>
                    {savedEntry ? (
                      <span
                        className={lateEntry ? "time-shifted" : undefined}
                        title={
                          lateEntry
                            ? `Entrata posticipata rispetto alle ${time}`
                            : "Orario di entrata"
                        }
                      >
                        Entrata <strong>{savedEntry}</strong>
                      </span>
                    ) : null}
                    {savedExit ? (
                      <span
                        className={earlyExit ? "time-shifted" : undefined}
                        title={
                          earlyExit
                            ? `Uscita anticipata rispetto alle ${end}`
                            : "Orario di uscita"
                        }
                      >
                        Uscita <strong>{savedExit}</strong>
                      </span>
                    ) : null}
                    {lateEntry ? (
                      <span className="badge badge-warn">Entrata posticipata</span>
                    ) : null}
                    {earlyExit ? (
                      <span className="badge badge-warn">Uscita anticipata</span>
                    ) : null}
                    <button
                      type="button"
                      className="link-button times-edit"
                      onClick={openEditor}
                      disabled={busy}
                    >
                      Modifica
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="times-toggle"
                    onClick={openEditor}
                    disabled={busy}
                    aria-expanded={editorOpen}
                  >
                    <Clock3 size={14} />
                    Aggiungi orari di entrata/uscita
                  </button>
                )}

                {editorOpen ? (
                  <form className="times-editor" onSubmit={(formEvent) => void saveTimes(formEvent)}>
                    <div className="times-fields">
                      <label className="time-field">
                        <span>Entrata</span>
                        <input
                          type="time"
                          value={entryTime}
                          onChange={(changeEvent) => setEntryTime(changeEvent.target.value)}
                          disabled={busy}
                        />
                        <small>Prevista {time}</small>
                      </label>
                      <label className="time-field">
                        <span>Uscita</span>
                        <input
                          type="time"
                          value={exitTime}
                          onChange={(changeEvent) => setExitTime(changeEvent.target.value)}
                          disabled={busy}
                        />
                        <small>Prevista {end}</small>
                      </label>
                    </div>
                    {timeError ? (
                      <p className="times-error" role="alert">
                        {timeError}
                      </p>
                    ) : null}
                    <div className="times-actions">
                      {hasTimes ? (
                        <button
                          type="button"
                          className="button button-ghost button-small"
                          onClick={() => void removeTimes()}
                          disabled={busy}
                        >
                          Rimuovi orari
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => setEditorOpen(false)}
                        disabled={busy}
                      >
                        Annulla
                      </button>
                      <button
                        type="submit"
                        className="button button-primary button-small"
                        disabled={busy}
                      >
                        Salva orari
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
