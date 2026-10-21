import { Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { SyncProvider } from "./sync";
import Layout from "./components/Layout";
import { LogoMark } from "./components/Logo";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/Login";
import ChangePasswordPage from "./pages/ChangePassword";
import TodayPage from "./pages/Today";
import CalendarPage from "./pages/Calendar";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import AdminUsersPage from "./pages/AdminUsers";
import AdminUserPage from "./pages/AdminUser";
import PrivacyPage from "./pages/Privacy";

function Splash() {
  return (
    <div className="splash">
      <LogoMark size={52} />
      <Spinner size={22} />
    </div>
  );
}

function ProtectedShell() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <LoginPage />;
  if (user.must_change_password) return <ChangePasswordPage />;

  return (
    <SyncProvider>
      <Layout />
    </SyncProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/statistiche" element={<StatsPage />} />
        <Route path="/impostazioni" element={<SettingsPage />} />
        <Route path="/admin/utenti" element={<AdminUsersPage />} />
        <Route path="/admin/utenti/:username" element={<AdminUserPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}
