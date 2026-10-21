import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  LogOut,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { LogoMark } from "./Logo";
import { timeAgo } from "../date";

const NAV = [
  { to: "/", label: "Oggi", icon: CalendarCheck, end: true },
  { to: "/calendario", label: "Calendario", icon: CalendarDays, end: false },
  { to: "/statistiche", label: "Statistiche", icon: BarChart3, end: false },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { syncing, syncNow, lastError } = useSync();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const name = user?.name?.split(" ")[0] || "Studente";

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark size={40} />
          <div>
            <strong>Presenze</strong>
            <span>Registro personale</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navigazione principale">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sync-box">
            <div className="sync-box-head">
              <RefreshCw size={14} className={syncing ? "spinning" : ""} />
              <span>{syncing ? "Sincronizzazione…" : "Sync automatica"}</span>
            </div>
            <p>Ultima: {timeAgo(user?.last_sync_at ?? null)}</p>
            {lastError ? (
              <p className="sync-error" title={lastError}>
                {lastError}
              </p>
            ) : null}
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => void syncNow()}
              disabled={syncing}
            >
              Sincronizza ora
            </button>
          </div>

          <div className="user-box">
            {user?.picture ? (
              <img src={user.picture} alt="" className="avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar avatar-fallback">{name.charAt(0).toUpperCase()}</span>
            )}
            <div className="user-meta">
              <strong>{name}</strong>
              <span>{user?.email}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Esci"
              aria-label="Esci"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-brand">
            <LogoMark size={30} />
            <span>Presenze</span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Sincronizza ora"
              title={syncing ? "Sincronizzazione in corso" : "Sincronizza ora"}
              onClick={() => void syncNow()}
              disabled={syncing}
            >
              <RefreshCw size={19} className={syncing ? "spinning" : ""} />
            </button>
            {user?.picture ? (
              <img src={user.picture} alt="" className="avatar avatar-small" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar avatar-small avatar-fallback">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </header>

        <main className="content">
          {user?.needs_reauth ? (
            <div className="alert alert-error reauth-banner">
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
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navigazione">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `bottom-link${isActive ? " active" : ""}`}
            >
              <Icon size={21} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
