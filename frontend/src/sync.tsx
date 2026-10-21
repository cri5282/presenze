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
import { api } from "./api";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { SyncResult } from "./types";

interface SyncContextValue {
  syncing: boolean;
  version: number;
  lastError: string | null;
  syncNow: (silent?: boolean) => Promise<SyncResult | null>;
}

const SyncContext = createContext<SyncContextValue | null>(null);
const AUTO_SYNC_AFTER_MS = 10 * 60 * 1000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const autoFor = useRef<number | null>(null);

  const syncNow = useCallback(
    async (silent = false): Promise<SyncResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setSyncing(true);
      setLastError(null);
      try {
        const result = await api.sync();
        if (!result.ok) {
          const message = result.errors[0] ?? "Sincronizzazione non riuscita";
          setLastError(message);
          if (!silent) push(message, "error");
        } else if (!silent) {
          push(
            result.events_processed > 0
              ? `Sincronizzati ${result.events_processed} eventi`
              : "Calendario già aggiornato",
            "success",
          );
        }
        await refresh();
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
    [push, refresh],
  );

  useEffect(() => {
    if (!user || user.needs_reauth) return;
    if (autoFor.current === user.id) return;
    autoFor.current = user.id;
    const last = user.last_sync_at ? new Date(user.last_sync_at).getTime() : 0;
    if (Date.now() - last > AUTO_SYNC_AFTER_MS) {
      void syncNow(true);
    }
  }, [user, syncNow]);

  const value = useMemo(
    () => ({ syncing, version, lastError, syncNow }),
    [syncing, version, lastError, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync deve essere usato dentro SyncProvider");
  return context;
}
