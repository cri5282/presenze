import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { LogoMark } from "../components/Logo";

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [error] = useState(() => new URLSearchParams(window.location.search).get("error"));
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (error) window.history.replaceState({}, "", "/");
  }, [error]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setConfigured(data ? Boolean(data.google_configured) : null))
      .catch(() => setConfigured(null));
  }, []);

  function login() {
    window.location.href = "/api/auth/google/login";
  }

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-brand">
          <LogoMark size={60} />
          <div>
            <h1>Presenze</h1>
            <p>Il tuo registro personale, sempre allineato al calendario.</p>
          </div>
        </div>

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        {configured === false ? (
          <div className="alert alert-warn" role="alert">
            <span>
              Il server non è ancora collegato a Google. Configura <code>GOOGLE_CLIENT_ID</code> e{" "}
              <code>GOOGLE_CLIENT_SECRET</code> nel backend per abilitare l'accesso.
            </span>
          </div>
        ) : null}

        <button
          type="button"
          className="google-button"
          onClick={login}
          disabled={configured === false}
        >
          <GoogleIcon />
          Continua con Google
        </button>

        <ul className="login-features">
          <li>
            <RefreshCw size={17} />
            <span>Importa e riallinea periodicamente gli eventi del tuo Google Calendar</span>
          </li>
          <li>
            <CalendarCheck size={17} />
            <span>Un tap per segnare presente, assente o giustificato</span>
          </li>
          <li>
            <BarChart3 size={17} />
            <span>Percentuali di presenza per materia e periodo</span>
          </li>
          <li>
            <ShieldCheck size={17} />
            <span>Dati privati, token Google cifrato, nessuna condivisione</span>
          </li>
        </ul>

        <p className="login-note">
          Accedendo autorizzi la sola lettura del calendario. L'app non crea, modifica o elimina
          eventi. Leggi l'<Link to="/privacy">informativa privacy</Link>.
        </p>
      </div>
    </div>
  );
}
