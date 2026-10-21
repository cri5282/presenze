import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../auth";
import { useSync } from "../sync";
import { LogoMark } from "./Logo";
import { timeAgo } from "../date";

const BASE_NAV = [
  { to: "/", label: "Oggi", icon: CalendarCheck, end: true },
  { to: "/calendario", label: "Calendario", icon: CalendarDays, end: false },
  { to: "/statistiche", label: "Statistiche", icon: BarChart3, end: false },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { syncing, syncNow, lastError, lastSyncAt } = useSync();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const name = user?.name?.split(" ")[0] || "Studente";
  const isAdmin = user?.role === "admin";
  const nav = isAdmin
    ? [
        ...BASE_NAV.slice(0, 3),
        { to: "/admin/utenti", label: "Utenti", icon: Users, end: false },
        ...BASE_NAV.slice(3),
      ]
    : BASE_NAV;

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
            <strong>Registro</strong>
            <span>{isAdmin ? "Amministrazione" : "Registro personale"}</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navigazione principale">
          {nav.map((item) => {
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
          {isAdmin ? (
            <div className="sync-box">
              <div className="sync-box-head">
                <RefreshCw size={14} className={syncing ? "spinning" : ""} />
                <span>{syncing ? "Sincronizzazione…" : "Calendario condiviso"}</span>
              </div>
              <p>Ultima: {timeAgo(lastSyncAt)}</p>
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
          ) : (
            <div className="sync-box">
              <div className="sync-box-head">
                <ShieldCheck size={14} />
                <span>Calendario della classe</span>
              </div>
              <p>Aggiornato {timeAgo(lastSyncAt)}</p>
              <p className="sync-note">La sincronizzazione è gestita dall'amministratore.</p>
            </div>
          )}

          <div className="user-box">
            <span className="avatar avatar-fallback">{name.charAt(0).toUpperCase()}</span>
            <div className="user-meta">
              <strong>
                {name} {isAdmin ? <span className="role-pill">admin</span> : null}
              </strong>
              <span>@{user?.username}</span>
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
            <span>Registro</span>
          </div>
          <div className="topbar-actions">
            {isAdmin ? (
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
            ) : null}
            <span className="avatar avatar-small avatar-fallback">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navigazione">
        {nav.map((item) => {
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
