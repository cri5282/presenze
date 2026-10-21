import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./data";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { SyncResult } from "./types";

interface SyncContextValue {
  syncing: boolean;
  version: number;
  lastError: string | null;
  lastSyncAt: string | null;
  calendarIds: string[];
  settingsLoading: boolean;
  syncNow: (silent?: boolean) => Promise<SyncResult | null>;
  saveCalendars: (calendarIds: string[]) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [calendarIds, setCalendarIds] = useState<string[]>(["primary"]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const inFlight = useRef(false);

  const refreshSettings = useCallback(async () => {
    if (!user) {
      setSettingsLoading(false);
      return;
    }
    setSettingsLoading(true);
    try {
      const settings = await api.calendarSettings();
      setLastSyncAt(settings.last_sync_at);
      setCalendarIds(settings.calendar_ids.length ? settings.calendar_ids : ["primary"]);
    } catch {
      // La lettura delle impostazioni non deve bloccare l'app.
    } finally {
      setSettingsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const syncNow = useCallback(
    async (silent = false): Promise<SyncResult | null> => {
      if (!user || user.role !== "admin") {
        if (!silent) push("Solo l'amministratore può sincronizzare il calendario.", "error");
        return null;
      }
      if (inFlight.current) return null;
      inFlight.current = true;
      setSyncing(true);
      setLastError(null);
      try {
        const result = await api.sync();
        if (result.errors.length) {
          const message = result.errors[0];
          setLastError(message);
          if (!silent) {
            push(
              result.ok
                ? `Sincronizzazione parziale: ${message}`
                : message,
              result.ok ? "info" : "error",
            );
          }
        } else if (!silent) {
          push(
            result.events_processed > 0
              ? `Sincronizzati ${result.events_processed} eventi`
              : "Calendario già aggiornato",
            "success",
          );
        }
        if (result.last_sync_at) setLastSyncAt(result.last_sync_at);
        await refreshSettings();
        setVersion((current) => current + 1);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sincronizzazione non riuscita";
        setLastError(message);
        if (!silent) push(message, "error");
        return null;
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [push, refreshSettings, user],
  );

  const saveCalendars = useCallback(async (ids: string[]) => {
    const settings = await api.saveCalendars(ids);
    setCalendarIds(settings.calendar_ids);
    setVersion((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({
      syncing,
      version,
      lastError,
      lastSyncAt,
      calendarIds,
      settingsLoading,
      syncNow,
      saveCalendars,
      refreshSettings,
    }),
    [
      syncing,
      version,
      lastError,
      lastSyncAt,
      calendarIds,
      settingsLoading,
      syncNow,
      saveCalendars,
      refreshSettings,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync deve essere usato dentro SyncProvider");
  return context;
}
