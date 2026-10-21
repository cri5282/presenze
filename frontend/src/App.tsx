import { Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { SyncProvider } from "./sync";
import Layout from "./components/Layout";
import { LogoMark } from "./components/Logo";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/Login";
import TodayPage from "./pages/Today";
import CalendarPage from "./pages/Calendar";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
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
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}
