import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { useToast } from "../toast";
import { fmtDateTime, timeAgo } from "../date";
import { Spinner } from "../components/ui";
import type { CalendarInfo } from "../types";

interface Health {
  sync_interval_minutes: number;
  google_configured: boolean;
}

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth();
  const { syncNow, syncing } = useSync();
  const { push } = useToast();
  const navigate = useNavigate();
  const [calendars, setCalendars] = useState<CalendarInfo[] | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(user?.selected_calendars ?? []);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloadCals, setReloadCals] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);

  const standalone =
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    let alive = true;
    setCalError(null);
    api
      .calendars()
      .then((data) => {
        if (alive) setCalendars(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setCalError(err instanceof Error ? err.message : "Impossibile leggere i calendari");
        setCalendars([]);
      });
    return () => {
      alive = false;
    };
  }, [reloadCals]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  const dirty =
    [...selected].sort().join("|") !== [...(user?.selected_calendars ?? [])].sort().join("|");

  function toggle(calendarId: string) {
    setSelected((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  async function save() {
    if (!selected.length) {
      push("Seleziona almeno un calendario", "error");
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings(selected);
      await refresh();
      push("Calendari aggiornati");
      void syncNow(true);
    } catch (err) {
      push(err instanceof Error ? err.message : "Salvataggio non riuscito", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api.deleteAccount();
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      push(err instanceof Error ? err.message : "Cancellazione non riuscita", "error");
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configurazione</p>
          <h1>Impostazioni</h1>
          <p className="page-subtitle">Account, calendari e sincronizzazione.</p>
        </div>
      </header>

      {user?.needs_reauth ? (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <div>
            <strong>Collegamento a Google scaduto.</strong>
            <p>Ricollega l'account per riprendere la sincronizzazione del calendario.</p>
            <a className="button button-primary button-small" href="/api/auth/google/login">
              Ricollega Google
            </a>
          </div>
        </div>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Account</h2>
        </div>
        <div className="card account-card">
          {user?.picture ? (
            <img src={user.picture} alt="" className="avatar avatar-large" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar avatar-large avatar-fallback">
              {(user?.name || "U").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="account-meta">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            <LogOut size={15} /> Esci
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Calendari sincronizzati</h2>
          {dirty ? <span className="badge badge-warn">Modifiche non salvate</span> : null}
        </div>
        <p className="section-help">
          Scegli quali calendari Google importare. Il calendario principale è consigliato.
        </p>

        {calendars === null ? (
          <div className="card loading-card">
            <Spinner /> Caricamento calendari…
          </div>
        ) : calError ? (
          <div className="alert alert-error">
            <span>{calError}</span>
            <button
              type="button"
              className="link-button"
              onClick={() => setReloadCals((n) => n + 1)}
            >
              Riprova
            </button>
          </div>
        ) : calendars.length === 0 ? (
          <div className="alert alert-warn">Nessun calendario disponibile.</div>
        ) : (
          <div className="calendar-picker">
            {calendars.map((calendar) => {
              const checked = selected.includes(calendar.id);
              return (
                <label
                  key={calendar.id}
                  className={`calendar-option${checked ? " checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(calendar.id)}
                  />
                  <span
                    className="calendar-color"
                    style={{ background: calendar.background_color || "var(--accent)" }}
                  />
                  <span className="calendar-name">
                    {calendar.summary}
                    {calendar.primary ? <em>principale</em> : null}
                  </span>
                  <span className="calendar-check">{checked ? <Check size={16} /> : null}</span>
                </label>
              );
            })}
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => void save()}
                disabled={saving || !dirty || selected.length === 0}
              >
                {saving ? <Spinner size={16} /> : null}
                Salva calendari
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Sincronizzazione</h2>
        </div>
        <div className="card setting-row">
          <div>
            <strong>Ultimo allineamento</strong>
            <p>
              {user?.last_sync_at
                ? `${timeAgo(user.last_sync_at)} · ${fmtDateTime(user.last_sync_at)}`
                : "Mai eseguito"}
            </p>
            <p className="muted">
              Il server riallinea automaticamente i calendari
              {health ? ` ogni ${health.sync_interval_minutes} minuti` : " periodicamente"} e
              all'apertura dell'app.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void syncNow()}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? "spinning" : ""} />
            {syncing ? "Sincronizzo…" : "Sincronizza ora"}
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>App</h2>
        </div>
        <div className="card setting-row">
          <div>
            <strong>{standalone ? "Installata sul dispositivo" : "Installa come app"}</strong>
            {standalone ? (
              <p>Stai usando la modalità app: si apre a schermo intero. Lettura e modifica delle presenze richiedono la connessione.</p>
            ) : (
              <p>
                Su Android: menu del browser → <em>Installa app</em> / <em>Aggiungi a schermata
                Home</em>. Su desktop: icona di installazione nella barra degli indirizzi.
              </p>
            )}
          </div>
          <span className="setting-icon">
            {standalone ? <Smartphone size={22} /> : <Download size={22} />}
          </span>
        </div>
        <div className="card setting-row">
          <div>
            <strong>Privacy</strong>
            <p>
              Le presenze restano nel tuo database. Il token Google è cifrato lato server e viene
              usato solo per leggere il calendario.{" "}
              <Link className="link-button" to="/privacy">
                Leggi l'informativa completa
              </Link>
              .
            </p>
          </div>
          <span className="setting-icon">
            <ShieldCheck size={22} />
          </span>
        </div>
        <div className="card setting-row">
          <div>
            <strong>Calendario Google</strong>
            <p>L'app non modifica né crea eventi: ha solo accesso in lettura.</p>
          </div>
          <a
            className="button button-ghost button-small"
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
          >
            Apri <ExternalLink size={14} />
          </a>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Eliminazione account</h2>
        </div>
        <div className={`card danger-card${confirmDelete ? " danger-card-confirm" : ""}`}>
          <div className="danger-text">
            <strong>Elimina definitivamente l'account</strong>
            <p>
              Verranno cancellati profilo, eventi importati, presenze, calendari selezionati e
              token Google. Il collegamento a Google verrà revocato. L'operazione non è
              reversibile.
            </p>
            {confirmDelete ? (
              <p className="danger-warning">
                Sei sicuro? Non potrai recuperare le presenze registrate.
              </p>
            ) : null}
          </div>
          {confirmDelete ? (
            <div className="danger-actions">
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Annulla
              </button>
              <button
                type="button"
                className="button button-danger button-small"
                onClick={() => void handleDeleteAccount()}
                disabled={deleting}
              >
                {deleting ? <Spinner size={15} /> : <Trash2 size={15} />}
                {deleting ? "Eliminazione…" : "Elimina definitivamente"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-ghost button-small danger-trigger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} /> Elimina account
            </button>
          )}
        </div>
      </section>

      <p className="version-note">Presenze · versione 0.1.0</p>
    </div>
  );
}
