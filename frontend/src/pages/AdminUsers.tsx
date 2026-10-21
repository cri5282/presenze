import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useAuth } from "../auth";
import { api } from "../data";
import { friendlyError } from "../errors";
import { useToast } from "../toast";
import { Spinner } from "../components/ui";
import type { CreatedUser, User } from "../types";

interface Credential {
  username: string;
  name: string;
  password: string;
  reason: "creato" | "reimpostato";
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState("");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await api.adminUsers());
    } catch (err) {
      setError(friendlyError(err, "Impossibile caricare gli utenti."));
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load, reload]);

  const counts = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      active: list.filter((item) => item.is_active).length,
      pending: list.filter((item) => item.must_change_password).length,
    };
  }, [users]);

  if (!isAdmin) return <Navigate to="/" replace />;

  function addCredentials(created: CreatedUser[]) {
    setCredentials((current) => [
      ...current,
      ...created.map((item) => ({
        username: item.user.username,
        name: item.user.name,
        password: item.initial_password,
        reason: "creato" as const,
      })),
    ]);
  }

  async function createOne(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createUser(name.trim(), username.trim() || undefined);
      addCredentials([created]);
      setName("");
      setUsername("");
      setReload((value) => value + 1);
      push(`Account ${created.user.username} creato`, "success");
    } catch (err) {
      setError(friendlyError(err, "Creazione non riuscita."));
    } finally {
      setCreating(false);
    }
  }

  async function createBulk() {
    const names = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!names.length) {
      setBulkErrors(["Inserisci almeno un nome, uno per riga."]);
      return;
    }
    setBulkCreating(true);
    setError(null);
    setBulkErrors([]);
    try {
      const result = await api.bulkCreateUsers(names);
      addCredentials(result.created);
      setBulkErrors(result.errors);
      setBulk("");
      setReload((value) => value + 1);
      push(
        result.created.length
          ? `${result.created.length} account creati`
          : "Nessun account creato",
        result.created.length ? "success" : "error",
      );
    } catch (err) {
      setError(friendlyError(err, "Creazione multipla non riuscita."));
    } finally {
      setBulkCreating(false);
    }
  }

  async function toggleActive(target: User) {
    if (target.role === "admin") return;
    setBusyUser(target.username);
    try {
      await api.updateUser(target.username, { is_active: !target.is_active });
      setReload((value) => value + 1);
    } catch (err) {
      push(friendlyError(err, "Aggiornamento non riuscito."), "error");
    } finally {
      setBusyUser(null);
    }
  }

  async function submitRename(target: User) {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === target.name) {
      setEditingName(null);
      return;
    }
    setBusyUser(target.username);
    try {
      await api.updateUser(target.username, { name: trimmed });
      setReload((value) => value + 1);
      push(`Nome aggiornato: ${trimmed}`, "success");
    } catch (err) {
      push(friendlyError(err, "Aggiornamento non riuscito."), "error");
    } finally {
      setBusyUser(null);
      setEditingName(null);
    }
  }

  async function reset(target: User) {
    if (target.role === "admin") return;
    if (
      !window.confirm(
        `Reimpostare la password di ${target.name}? La vecchia password non funzionerà più.`,
      )
    ) {
      return;
    }
    setBusyUser(target.username);
    try {
      const password = await api.resetPassword(target.username);
      setCredentials((current) => [
        ...current,
        {
          username: target.username,
          name: target.name,
          password,
          reason: "reimpostato",
        },
      ]);
      setReload((value) => value + 1);
      push(`Password di ${target.username} reimpostata`, "success");
    } catch (err) {
      push(friendlyError(err, "Reimpostazione non riuscita."), "error");
    } finally {
      setBusyUser(null);
    }
  }

  async function remove(target: User) {
    if (target.role === "admin") return;
    if (
      !window.confirm(
        `Eliminare ${target.name} (${target.username})? Verranno cancellate anche tutte le sue presenze.`,
      )
    ) {
      return;
    }
    setBusyUser(target.username);
    try {
      await api.deleteUser(target.username);
      setReload((value) => value + 1);
      push(`Account ${target.username} eliminato`, "success");
    } catch (err) {
      push(friendlyError(err, "Eliminazione non riuscita."), "error");
    } finally {
      setBusyUser(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      push("Copiato", "success");
    } catch {
      push("Copia non disponibile: seleziona il testo manualmente.", "error");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Amministrazione</p>
          <h1>Utenti</h1>
          <p className="page-subtitle">
            Crea gli account della classe e gestisci accessi e password.
          </p>
        </div>
        <Link className="button button-ghost button-small" to="/impostazioni">
          <ArrowLeft size={15} /> Impostazioni
        </Link>
      </header>

      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => setReload((v) => v + 1)}>
            Riprova
          </button>
        </div>
      ) : null}

      <div className="admin-summary">
        <div className="metric-card">
          <Users size={18} />
          <div>
            <strong>{counts.total}</strong>
            <span>account</span>
          </div>
        </div>
        <div className="metric-card">
          <UserCheck size={18} />
          <div>
            <strong>{counts.active}</strong>
            <span>attivi</span>
          </div>
        </div>
        <div className="metric-card">
          <KeyRound size={18} />
          <div>
            <strong>{counts.pending}</strong>
            <span>password da cambiare</span>
          </div>
        </div>
      </div>

      <div className="admin-grid">
        <section className="section">
          <div className="section-head">
            <h2>Crea un account</h2>
          </div>
          <form className="card admin-form" onSubmit={(event) => void createOne(event)}>
            <label className="field">
              <span>Nome e cognome</span>
              <input
                type="text"
                placeholder="Nicolò Simonini"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>
                Username <em>facoltativo</em>
              </span>
              <input
                type="text"
                placeholder="mario.rossi"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <p className="form-hint">
              Se lo lasci vuoto viene ricavato dal nome. La password iniziale sarà{" "}
              <code>username.2026!</code>.
            </p>
            <button type="submit" className="button button-primary" disabled={creating}>
              {creating ? <Spinner size={16} /> : <Plus size={16} />}
              {creating ? "Creazione…" : "Crea account"}
            </button>
          </form>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Creazione multipla</h2>
          </div>
          <div className="card admin-form">
            <label className="field">
              <span>Un nome per riga</span>
              <textarea
                rows={6}
                placeholder={"Nicolò Simonini\nMario Rossi\nGiulia Bianchi"}
                value={bulk}
                onChange={(event) => setBulk(event.target.value)}
              />
            </label>
            <p className="form-hint">
              Ogni riga genera un account con username automatico e password iniziale.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void createBulk()}
              disabled={bulkCreating}
            >
              {bulkCreating ? <Spinner size={16} /> : <Users size={16} />}
              {bulkCreating ? "Creazione…" : "Crea account"}
            </button>
            {bulkErrors.length ? (
              <ul className="error-list">
                {bulkErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>

      {credentials.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Credenziali generate</h2>
            <span className="badge badge-warn">Mostrale subito</span>
          </div>
          <div className="card credentials-card">
            <p className="muted">
              Le password sono visibili solo in questo momento. Consegna le credenziali agli
              studenti: al primo accesso dovranno cambiare la password.
            </p>
            <div className="credential-list">
              {credentials.map((item, index) => (
                <div className="credential-row" key={`${item.username}-${index}`}>
                  <span className="credential-user">
                    <strong>{item.name}</strong>
                    <span>@{item.username}</span>
                    <em>{item.reason}</em>
                  </span>
                  <code>{item.username} / {item.password}</code>
                  <button
                    type="button"
                    className="icon-button"
                    title="Copia credenziali"
                    onClick={() => void copy(`${item.username} / ${item.password}`)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => setCredentials([])}
            >
              <Check size={15} /> Ho salvato le credenziali
            </button>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Elenco account</h2>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => setReload((value) => value + 1)}
            disabled={users === null}
          >
            <RefreshCw size={15} /> Aggiorna
          </button>
        </div>

        {users === null ? (
          <div className="card loading-card">
            <Spinner /> Caricamento utenti…
          </div>
        ) : users.length === 0 ? (
          <div className="card empty-inline">Nessun account. Crea il primo qui sopra.</div>
        ) : (
          <div className="card user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Studente</th>
                  <th>Username</th>
                  <th>Stato</th>
                  <th>Password</th>
                  <th aria-label="Azioni" />
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.username}>
                    <td>
                      {editingName === item.username ? (
                        <form
                          className="inline-edit"
                          onSubmit={(event) => { event.preventDefault(); void submitRename(item); }}
                        >
                          <input
                            type="text"
                            className="inline-edit-input"
                            value={editNameValue}
                            onChange={(event) => setEditNameValue(event.target.value)}
                            onBlur={() => void submitRename(item)}
                            autoFocus
                            disabled={busyUser === item.username}
                          />
                        </form>
                      ) : (
                        <span className="user-name-cell">
                          <button
                            type="button"
                            className="user-name-button"
                            onClick={() => navigate(`/admin/utenti/${encodeURIComponent(item.username)}`)}
                          >
                            {item.name}
                            {item.role === "admin" ? (
                              <span className="role-pill">admin</span>
                            ) : null}
                          </button>
                          {item.role !== "admin" ? (
                            <button
                              type="button"
                              className="icon-button icon-button-tiny"
                              title="Modifica nome"
                              aria-label="Modifica nome"
                              onClick={() => { setEditingName(item.username); setEditNameValue(item.name); }}
                            >
                              <Pencil size={13} />
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td>
                      <code>@{item.username}</code>
                    </td>
                    <td>
                      <span className={`badge ${item.is_active ? "badge-ok" : "badge-bad"}`}>
                        {item.is_active ? "attivo" : "disattivato"}
                      </span>
                    </td>
                    <td>
                      {item.must_change_password ? (
                        <span className="badge badge-warn">da cambiare</span>
                      ) : (
                        <span className="muted">personale</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {item.role !== "admin" ? (
                          <>
                            <button
                              type="button"
                              className="icon-button"
                              title={item.is_active ? "Disattiva" : "Riattiva"}
                              aria-label={item.is_active ? "Disattiva" : "Riattiva"}
                              onClick={() => void toggleActive(item)}
                              disabled={busyUser === item.username}
                            >
                              {busyUser === item.username ? (
                                <Spinner size={15} />
                              ) : item.is_active ? (
                                <UserX size={16} />
                              ) : (
                                <UserCheck size={16} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              title="Reimposta password"
                              aria-label="Reimposta password"
                              onClick={() => void reset(item)}
                              disabled={busyUser === item.username}
                            >
                              <KeyRound size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button-danger"
                              title="Elimina account"
                              aria-label="Elimina account"
                              onClick={() => void remove(item)}
                              disabled={busyUser === item.username}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : (
                          <ShieldCheck size={16} className="admin-shield" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
