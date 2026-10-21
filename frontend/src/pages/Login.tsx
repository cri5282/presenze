import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuth } from "../auth";
import { api } from "../data";
import { friendlyError } from "../errors";
import { isFirebaseConfigured } from "../firebase";
import { PasswordInput, Spinner } from "../components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setSetupDone(false);
      return;
    }
    let alive = true;
    api
      .checkSetup()
      .then((configured) => {
        if (alive) setSetupDone(configured);
      })
      .catch(() => {
        if (alive) setSetupDone(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(friendlyError(err, "Accesso non riuscito."));
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
            <h1>Registro</h1>
            <p>Il registro condiviso della classe, con i dati di ognuno separati.</p>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <div className="alert alert-error" role="alert">
            <span>
              Firebase non è configurato. Imposta le variabili <code>VITE_FIREBASE_*</code> e
              ricostruisci l'app seguendo il README.
            </span>
          </div>
        ) : setupDone === false ? (
          <div className="alert alert-warn" role="alert">
            <span>
              Configurazione iniziale non completata. Esegui{" "}
              <code>npm run bootstrap</code> nella cartella <code>scripts/</code> per creare
              l'amministratore e importare i dati esistenti.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nome.cognome"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={!isFirebaseConfigured || busy}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <PasswordInput
              autoComplete="current-password"
              placeholder="La tua password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!isFirebaseConfigured || busy}
              required
            />
          </label>
          <button
            type="submit"
            className="button button-primary login-submit"
            disabled={!isFirebaseConfigured || busy}
          >
            {busy ? <Spinner size={17} /> : null}
            {busy ? "Accesso…" : "Accedi"}
          </button>
        </form>

        <ul className="login-features">
          <li>
            <CalendarCheck size={17} />
            <span>Un tap per segnare presente o assente</span>
          </li>
          <li>
            <RefreshCw size={17} />
            <span>Calendario condiviso aggiornato manualmente dall'amministratore</span>
          </li>
          <li>
            <BarChart3 size={17} />
            <span>Statistiche personali per materia e periodo</span>
          </li>
          <li>
            <Users size={17} />
            <span>Ogni studente vede e modifica solo le proprie presenze</span>
          </li>
          <li>
            <ShieldCheck size={17} />
            <span>Nessun accesso Google per gli studenti, solo credenziali della classe</span>
          </li>
        </ul>

        <p className="login-note">
          Se è il tuo primo accesso, usa la password iniziale fornita dall'amministratore: ti
          verrà chiesto di cambiarla subito. Leggi l'
          <Link to="/privacy">informativa privacy</Link>.
        </p>
      </div>
    </div>
  );
}
