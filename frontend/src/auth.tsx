import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((data) => {
        if (alive) setUser(data);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const onUnauthorized = () => setUser(null);
    window.addEventListener("presenze:unauthorized", onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener("presenze:unauthorized", onUnauthorized);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // anche se la chiamata fallisce, la sessione locale va azzerata
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return context;
}
