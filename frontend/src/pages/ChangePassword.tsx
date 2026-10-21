import { useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import { friendlyError } from "../errors";
import { LogoMark } from "../components/Logo";
import { PasswordInput, Spinner } from "../components/ui";

export default function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("Le due nuove password non coincidono.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(friendlyError(err, "Cambio password non riuscito."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-brand">
          <LogoMark size={60} />
          <div>
            <h1>Cambia la password</h1>
            <p>
              Ciao {user?.name?.split(" ")[0] || user?.username}. Prima di entrare devi
              sostituire la password iniziale.
            </p>
          </div>
        </div>

        <div className="alert alert-warn">
          <ShieldCheck size={18} />
          <span>
            La password iniziale è conosciuta dall'amministratore. Scegline una personale di
            almeno 6 caratteri.
          </span>
        </div>

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Password attuale</span>
            <PasswordInput
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Nuova password</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={6}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Ripeti la nuova password</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={6}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="button button-primary login-submit" disabled={busy}>
            {busy ? <Spinner size={17} /> : <KeyRound size={17} />}
            {busy ? "Salvataggio…" : "Salva nuova password"}
          </button>
        </form>

        <button
          type="button"
          className="button button-ghost login-logout"
          onClick={() => void logout()}
        >
          <LogOut size={15} /> Esci
        </button>
      </div>
    </div>
  );
}
