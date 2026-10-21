import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { useToast } from "../toast";
import { api } from "../data";
import { friendlyError } from "../errors";
import { isGoogleConfigured } from "../firebase";
import { fmtDateTime, timeAgo } from "../date";
import { PasswordInput, Spinner } from "../components/ui";
import type { CalendarInfo } from "../types";

export default function SettingsPage() {
  const { user, changePassword, deleteAccount, logout } = useAuth();
  const { syncNow, syncing, lastSyncAt, calendarIds, saveCalendars, settingsLoading } = useSync();
  const { push } = useToast();
  const navigate = useNavigate();

  const isAdmin = user?.role === "admin";

  const [calendars, setCalendars] = useState<CalendarInfo[] | null>(null);
  const [selected, setSelected] = useState<string[]>(calendarIds);
  const [calError, setCalError] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const standalone =
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    setSelected(calendarIds);
  }, [calendarIds]);

  const dirty =
    [...selected].sort().join("|") !== [...calendarIds].sort().join("|");

  async function connectGoogle() {
    setConnectBusy(true);
    setCalError(null);
    try {
      const list = await api.connectGoogle();
      setCalendars(list);
      const available = new Set(list.map((calendar) => calendar.id));
      const next = selected.filter((id) => available.has(id));
      if (!next.length) {
        const primary = list.find((calendar) => calendar.primary);
        if (primary) next.push(primary.id);
      }
      setSelected(next);
      push("Calendario Google collegato", "success");
    } catch (error) {
      setCalError(friendlyError(error, "Collegamento a Google non riuscito."));
    } finally {
      setConnectBusy(false);
    }
  }

  function toggle(calendarId: string) {
    setSelected((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  async function saveSelection() {
    if (!selected.length) {
      push("Seleziona almeno un calendario.", "error");
      return;
    }
    setSaving(true);
    try {
      await saveCalendars(selected);
      push("Calendari salvati. Premi “Sincronizza ora” per importare gli eventi.", "success");
    } catch (error) {
      push(friendlyError(error, "Salvataggio non riuscito."), "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("Le due nuove password non coincidono.");
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      push("Password aggiornata", "success");
    } catch (error) {
      setPasswordError(friendlyError(error, "Cambio password non riuscito."));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate("/", { replace: true });
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(friendlyError(error, "Cancellazione non riuscita."));
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configurazione</p>
          <h1>Impostazioni</h1>
          <p className="page-subtitle">Account, calendario condiviso e sicurezza.</p>
        </div>
      </header>

      {isAdmin && user?.must_change_password ? (
        <div className="alert alert-warn">
          <AlertTriangle size={18} />
          <span>Devi cambiare la password iniziale prima di poter usare l'app.</span>
        </div>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Account</h2>
        </div>
        <div className="card account-card">
          <span className="avatar avatar-large avatar-fallback">
            {(user?.name || "U").charAt(0).toUpperCase()}
          </span>
          <div className="account-meta">
            <strong>
              {user?.name} {isAdmin ? <span className="role-pill">amministratore</span> : null}
            </strong>
            <span>@{user?.username}</span>
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
        {isAdmin ? (
          <div className="card setting-row">
            <div>
              <strong>Gestione utenti</strong>
              <p>Crea gli account della classe, reimposta le password e controlla le presenze.</p>
            </div>
            <Link className="button button-secondary button-small" to="/admin/utenti">
              <Users size={15} /> Apri utenti
            </Link>
          </div>
        ) : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Sicurezza</h2>
        </div>
        <form className="card password-form" onSubmit={(event) => void submitPassword(event)}>
          <div>
            <strong>Cambia password</strong>
            <p className="muted">
              La password serve per accedere da qualsiasi dispositivo. Non viene mai salvata in
              chiaro nel database.
            </p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Password attuale</span>
              <PasswordInput
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Nuova password</span>
              <PasswordInput
                autoComplete="new-password"
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Ripeti nuova password</span>
              <PasswordInput
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
          </div>
          {passwordError ? (
            <p className="form-error" role="alert">
              {passwordError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={passwordBusy}>
              {passwordBusy ? <Spinner size={16} /> : <KeyRound size={16} />}
              {passwordBusy ? "Salvataggio…" : "Aggiorna password"}
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Calendario condiviso</h2>
          {isAdmin ? <span className="badge badge-ok">Solo admin</span> : null}
        </div>
        <div className="card setting-row">
          <div>
            <strong>Ultimo allineamento</strong>
            <p>
              {lastSyncAt ? `${timeAgo(lastSyncAt)} · ${fmtDateTime(lastSyncAt)}` : "Mai eseguito"}
            </p>
            <p className="muted">
              {isAdmin
                ? "Gli eventi vengono importati solo quando premi “Sincronizza ora”. Gli studenti non collegano Google."
                : "Il calendario è unico per tutta la classe ed è aggiornato dall'amministratore."}
            </p>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void syncNow()}
              disabled={syncing || settingsLoading}
            >
              <RefreshCw size={16} className={syncing ? "spinning" : ""} />
              {syncing ? "Sincronizzo…" : "Sincronizza ora"}
            </button>
          ) : (
            <ShieldCheck size={22} className="setting-icon" />
          )}
        </div>

        {isAdmin ? (
          <>
            {!isGoogleConfigured ? (
              <div className="alert alert-warn">
                <AlertTriangle size={18} />
                <span>
                  Google Calendar non è configurato. Imposta <code>VITE_GOOGLE_CLIENT_ID</code> e
                  aggiungi l'origine del sito tra i JavaScript origins del client OAuth.
                </span>
              </div>
            ) : null}

            {calError ? (
              <div className="alert alert-error">
                <span>{calError}</span>
              </div>
            ) : null}

            <div className="card calendar-admin-card">
              <div className="calendar-admin-head">
                <div>
                  <strong>Calendari da importare</strong>
                  <p className="muted">
                    {calendars
                      ? "Seleziona solo il calendario della classe e salva: i suoi eventi saranno visibili a tutti gli studenti."
                      : `${calendarIds.length} calendari configurati. Carica l'elenco per modificarli.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => void connectGoogle()}
                  disabled={connectBusy || !isGoogleConfigured}
                >
                  {connectBusy ? <Spinner size={15} /> : <RefreshCw size={15} />}
                  {connectBusy ? "Collegamento…" : "Collega Google / carica calendari"}
                </button>
              </div>

              {calendars ? (
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
                        <span className="calendar-check">
                          {checked ? <Check size={16} /> : null}
                        </span>
                      </label>
                    );
                  })}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void saveSelection()}
                      disabled={saving || !dirty || selected.length === 0}
                    >
                      {saving ? <Spinner size={16} /> : null}
                      Salva calendari
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="card setting-row">
            <div>
              <strong>Calendari configurati</strong>
              <p>
                {settingsLoading
                  ? "Caricamento…"
                  : `${calendarIds.length} ${calendarIds.length === 1 ? "calendario" : "calendari"} importati dall'amministratore.`}
              </p>
              <p className="muted">
                Non serve collegare il tuo account Google: vedrai gli eventi condivisi della
                classe.
              </p>
            </div>
            <ShieldCheck size={22} className="setting-icon" />
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>App</h2>
        </div>
        <div className="card setting-row">
          <div>
            <strong>{standalone ? "Installata sul dispositivo" : "Installa come app"}</strong>
            {standalone ? (
              <p>
                Stai usando la modalità app: si apre a schermo intero. Lettura e modifica delle
                presenze richiedono la connessione.
              </p>
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
              I dati sono su Firebase. L'accesso a Google Calendar è solo dell'amministratore e
              avviene nel browser, senza salvare token sul server.{" "}
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

      {!isAdmin ? (
        <section className="section">
          <div className="section-head">
            <h2>Eliminazione account</h2>
          </div>
        <div className={`card danger-card${confirmDelete ? " danger-card-confirm" : ""}`}>
          <div className="danger-text">
            <strong>Elimina definitivamente il tuo account</strong>
            <p>
              Verranno cancellati profilo, presenze e accesso all'app. L'operazione non è
              reversibile.
            </p>
            {confirmDelete ? (
              <form className="delete-form" onSubmit={(event) => void handleDeleteAccount(event)}>
                <p className="danger-warning">
                  Inserisci la password attuale per confermare la cancellazione.
                </p>
                <label className="field">
                  <span>Password attuale</span>
                  <PasswordInput
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    required
                  />
                </label>
                {deleteError ? (
                  <p className="form-error" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="danger-actions">
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeletePassword("");
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="button button-danger button-small"
                    disabled={deleting}
                  >
                    {deleting ? <Spinner size={15} /> : <Trash2 size={15} />}
                    {deleting ? "Eliminazione…" : "Elimina definitivamente"}
                  </button>
                </div>
              </form>
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
        </div>
        </section>
      ) : null}

      <p className="version-note">Registro · Firebase · versione 0.2.0</p>
    </div>
  );
}
