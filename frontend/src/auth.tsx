import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  updatePassword,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, isFirebaseConfigured, requireAuth, requireDb } from "./firebase";
import { friendlyError } from "./errors";
import { setSessionUsername } from "./session";
import {
  deleteOwnAccount,
  findAuthEmail,
  isActiveDirectory,
  loadProfile,
  normalizeUsername,
} from "./users";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
  deleteAccount: (currentPassword: string) => Promise<void>;
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (!active) return;
      if (!firebaseUser) {
        setSessionUsername(null);
        setUser(null);
        setLoading(false);
        return;
      }

      loadProfile(firebaseUser)
        .then((profile) => {
          if (!active) return;
          setSessionUsername(profile.username);
          setUser(profile);
        })
        .catch(async () => {
          await signOut(requireAuth()).catch(() => undefined);
          if (active) {
            setSessionUsername(null);
            setUser(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const current = requireAuth().currentUser;
    if (!current) {
      setSessionUsername(null);
      setUser(null);
      return null;
    }
    const profile = await loadProfile(current);
    setSessionUsername(profile.username);
    setUser(profile);
    return profile;
  }, []);

  const login = useCallback(async (rawUsername: string, password: string) => {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase non configurato. Contatta l'amministratore.");
    }
    const username = normalizeUsername(rawUsername);
    if (!username) throw new Error("Inserisci il tuo username.");
    const email = await findAuthEmail(username);
    if (!email) throw new Error("Username non trovato. Controlla di averlo scritto correttamente.");
    const active = await isActiveDirectory(username);
    if (active === false) throw new Error("Account disattivato. Contatta l'amministratore.");

    await signInWithEmailAndPassword(requireAuth(), email, password);
    try {
      const profile = await loadProfile(requireAuth().currentUser as FirebaseUser);
      setSessionUsername(profile.username);
      setUser(profile);
      return profile;
    } catch (error) {
      await signOut(requireAuth()).catch(() => undefined);
      setSessionUsername(null);
      setUser(null);
      throw error;
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const firebaseUser = requireAuth().currentUser;
      if (!firebaseUser?.email) throw new Error("Sessione non valida: effettua di nuovo l'accesso.");
      if (newPassword.length < 6) {
        throw new Error("La nuova password deve contenere almeno 6 caratteri.");
      }
      if (newPassword === currentPassword) {
        throw new Error("La nuova password deve essere diversa da quella attuale.");
      }

      try {
        const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
        await updatePassword(firebaseUser, newPassword);
      } catch (error) {
        throw new Error(friendlyError(error, "Impossibile cambiare la password."));
      }

      const username = user?.username;
      if (username) {
        await updateDoc(doc(requireDb(), "users", username), { mustChangePassword: false });
      }
      const profile = await loadProfile(firebaseUser);
      setSessionUsername(profile.username);
      setUser(profile);
      return profile;
    },
    [user?.username],
  );

  const deleteAccount = useCallback(
    async (currentPassword: string) => {
      const firebaseUser = requireAuth().currentUser;
      if (!firebaseUser?.email) throw new Error("Sessione non valida: effettua di nuovo l'accesso.");
      if (!user) throw new Error("Profilo non disponibile.");
      try {
        const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
      } catch (error) {
        throw new Error(friendlyError(error, "Password non corretta."));
      }
      await deleteOwnAccount(user.username);
      await deleteUser(firebaseUser);
      setSessionUsername(null);
      setUser(null);
    },
    [user],
  );

  const logout = useCallback(async () => {
    await signOut(requireAuth()).catch(() => undefined);
    setSessionUsername(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, changePassword, deleteAccount, refresh, logout }),
    [user, loading, login, changePassword, deleteAccount, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return context;
}

export async function checkAdminConfigured(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const snap = await getDoc(doc(requireDb(), "loginDirectory", "admin"));
  return snap.exists();
}
