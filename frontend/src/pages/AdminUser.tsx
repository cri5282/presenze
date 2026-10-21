import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, CalendarOff, Check, X } from "lucide-react";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { api } from "../data";
import { friendlyError } from "../errors";
import { addMonths, fmtShort, fmtTime, startOfMonth } from "../date";
import { EmptyState, ErrorBanner, Spinner } from "../components/ui";
import type { EventItem, Stats, User } from "../types";

const STATUS_LABEL = {
  present: "Presente",
  absent: "Assente",
} as const;

export default function AdminUserPage() {
  const { user: currentUser } = useAuth();
  const { username: rawUsername } = useParams<{ username: string }>();
  const { version } = useSync();
  const username = rawUsername ? decodeURIComponent(rawUsername) : "";
  const [profile, setProfile] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const from = startOfMonth(new Date());
    return { from, to: addMonths(from, 1) };
  }, []);

  useEffect(() => {
    if (!username || currentUser?.role !== "admin") return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.adminUser(username),
      api.stats(range.from, range.to, username),
      api.events(range.from, range.to, username),
    ])
      .then(([nextProfile, nextStats, nextEvents]) => {
        if (!alive) return;
        setProfile(nextProfile);
        setStats(nextStats);
        setEvents(nextEvents);
      })
      .catch((err: unknown) => {
        if (alive) setError(friendlyError(err, "Impossibile caricare l'utente."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [currentUser?.role, range, username, version]);

  if (currentUser?.role !== "admin") return <Navigate to="/" replace />;

  const marked = useMemo(
    () => (events ?? []).filter((event) => event.attendance).sort((a, b) => b.start.localeCompare(a.start)),
    [events],
  );

  if (!username) return <Navigate to="/admin/utenti" replace />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Amministrazione</p>
          <h1>{profile?.name || "Utente"}</h1>
          <p className="page-subtitle">
            @{username} · dati del mese corrente. Sola lettura.
          </p>
        </div>
        <Link className="button button-ghost button-small" to="/admin/utenti">
          <ArrowLeft size={15} /> Tutti gli utenti
        </Link>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? (
        <div className="card loading-card">
          <Spinner /> Caricamento…
        </div>
      ) : !profile ? (
        <EmptyState icon={<CalendarOff size={26} />} title="Utente non trovato">
          L'account potrebbe essere stato eliminato.
        </EmptyState>
      ) : (
        <>
          <div className="card account-card">
            <span className="avatar avatar-large avatar-fallback">
              {(profile.name || profile.username).charAt(0).toUpperCase()}
            </span>
            <div className="account-meta">
              <strong>
                {profile.name} {profile.role === "admin" ? <span className="role-pill">admin</span> : null}
              </strong>
              <span>@{profile.username}</span>
            </div>
            <span className={`badge ${profile.is_active ? "badge-ok" : "badge-bad"}`}>
              {profile.is_active ? "attivo" : "disattivato"}
            </span>
            {profile.must_change_password ? (
              <span className="badge badge-warn">password da cambiare</span>
            ) : null}
          </div>

          {stats ? (
            <>
              <div className="admin-summary">
                <div className="metric-card">
                  <Check size={18} />
                  <div>
                    <strong>{stats.present}</strong>
                    <span>presente</span>
                  </div>
                </div>
                <div className="metric-card">
                  <X size={18} />
                  <div>
                    <strong>{stats.absent}</strong>
                    <span>assenze</span>
                  </div>
                </div>
                <div className="metric-card">
                  <BarChart3 size={18} />
                  <div>
                    <strong>{stats.marked ? `${Math.round(stats.rate)}%` : "—"}</strong>
                    <span>presenze</span>
                  </div>
                </div>
              </div>

              <section className="section">
                <div className="section-head">
                  <h2>Per materia</h2>
                  <span className="section-count">{stats.groups.length}</span>
                </div>
                {stats.groups.length === 0 ? (
                  <div className="card empty-inline">Nessuna lezione registrata questo mese.</div>
                ) : (
                  <div className="group-list">
                    {stats.groups.map((group) => (
                      <div key={group.title} className="group-row">
                        <div className="group-head">
                          <span className="group-title">{group.title}</span>
                          <span className="group-rate">
                            {group.present}/{group.present + group.absent}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className={
                              group.rate >= 80
                                ? "bar bar-good"
                                : group.rate >= 60
                                  ? "bar bar-warn"
                                  : "bar bar-bad"
                            }
                            style={{ width: `${Math.max(group.rate, group.present > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <div className="group-meta">
                          <span>
                            <i className="dot dot-present" /> {group.present}
                            <i className="dot dot-absent" /> {group.absent}
                            {group.unmarked > 0 ? (
                              <>
                                <i className="dot dot-unmarked" /> {group.unmarked}
                              </>
                            ) : null}
                          </span>
                          <strong>{group.rate}%</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}

          <section className="section">
            <div className="section-head">
              <h2>Lezioni registrate</h2>
              <span className="section-count">{marked.length}</span>
            </div>
            {marked.length === 0 ? (
              <div className="card empty-inline">Nessuna presenza segnata questo mese.</div>
            ) : (
              <div className="card record-list">
                {marked.map((event) => {
                  const attendance = event.attendance;
                  if (!attendance) return null;
                  return (
                    <div className="record-row" key={event.id}>
                      <span className={`record-dot record-${attendance.status}`} />
                      <div className="record-main">
                        <strong>{event.title}</strong>
                        <span>
                          {fmtShort(new Date(event.start))} ·{" "}
                          {event.all_day ? "Tutto il giorno" : `${fmtTime(event.start)}–${fmtTime(event.end)}`}
                          {attendance.entry_time || attendance.exit_time ? (
                            <>
                              {" "}
                              · effettivo {attendance.entry_time || "—"}–{attendance.exit_time || "—"}
                            </>
                          ) : null}
                        </span>
                      </div>
                      <span className={`badge badge-${attendance.status === "present" ? "ok" : "bad"}`}>
                        {STATUS_LABEL[attendance.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
