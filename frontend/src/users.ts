import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  AUTH_EMULATOR_URL,
  firebaseConfig,
  isEmulatorMode,
  requireDb,
} from "./firebase";
import { friendlyError } from "./errors";
import type { BulkCreateResult, CreatedUser, User, UserRole } from "./types";

const USERNAME_RE = /[^a-z0-9.]+/g;

export function normalizeUsername(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(USERNAME_RE, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 60)
    .replace(/^\.|\.$/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function toUser(username: string, data: Record<string, unknown>): User {
  return {
    id: username,
    username,
    name: typeof data.name === "string" && data.name.trim() ? data.name : username,
    role: data.role === "admin" ? "admin" : "user",
    must_change_password: data.mustChangePassword === true,
    is_active: data.active !== false,
    created_at: typeof data.createdAt === "string" ? data.createdAt : nowIso(),
  };
}

export async function loadProfile(firebaseUser: FirebaseUser): Promise<User> {
  const db = requireDb();
  const mapping = await getDoc(doc(db, "authUids", firebaseUser.uid));
  if (!mapping.exists()) {
    throw new Error("Account non abilitato. Chiedi all'amministratore di creare il tuo accesso.");
  }
  const username = String(mapping.data().username || "");
  if (!username) throw new Error("Profilo non valido. Contatta l'amministratore.");

  const profile = await getDoc(doc(db, "users", username));
  if (!profile.exists()) {
    throw new Error("Profilo non trovato. Contatta l'amministratore.");
  }

  const user = toUser(username, profile.data());
  if (!user.is_active) {
    throw new Error("Account disattivato. Contatta l'amministratore.");
  }
  return user;
}

export async function getUser(username: string): Promise<User | null> {
  const snap = await getDoc(doc(requireDb(), "users", username));
  return snap.exists() ? toUser(username, snap.data()) : null;
}

export async function listUsers(): Promise<User[]> {
  const snap = await getDocs(collection(requireDb(), "users"));
  return snap.docs
    .map((item) => toUser(item.id, item.data()))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.name.localeCompare(b.name, "it");
    });
}

async function uniqueUsername(base: string): Promise<string> {
  const db = requireDb();
  const clean = normalizeUsername(base);
  if (!clean) throw new Error("Nome non valido: impossibile generare lo username.");
  let candidate = clean;
  let suffix = 2;
  while ((await getDoc(doc(db, "users", candidate))).exists()) {
    candidate = `${clean}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

interface ProvisionedAuth {
  uid: string;
  email: string;
}

async function createAuthAccount(
  username: string,
  password: string,
  emailSeed = username,
): Promise<ProvisionedAuth> {
  let secondary: FirebaseApp | null = null;
  let secondaryAuth: Auth | null = null;
  try {
    secondary = initializeApp(
      firebaseConfig,
      `presenze-provision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    secondaryAuth = getAuth(secondary);
    if (isEmulatorMode) {
      connectAuthEmulator(secondaryAuth, AUTH_EMULATOR_URL, { disableWarnings: true });
    }

    const primaryEmail = `${emailSeed}@presenze.local`;
    let email = primaryEmail;
    try {
      await createUserWithEmailAndPassword(secondaryAuth, email, password);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "auth/email-already-in-use") throw error;
      email = `${emailSeed}.${Date.now().toString(36)}@presenze.local`;
      await createUserWithEmailAndPassword(secondaryAuth, email, password);
    }

    const uid = secondaryAuth.currentUser?.uid;
    if (!uid) throw new Error("Creazione account Firebase non riuscita.");
    await signOut(secondaryAuth);
    return { uid, email };
  } finally {
    if (secondary) await deleteApp(secondary).catch(() => undefined);
  }
}

async function writeNewUser(
  username: string,
  name: string,
  auth: ProvisionedAuth,
  role: UserRole,
  mustChangePassword: boolean,
): Promise<User> {
  const db = requireDb();
  const createdAt = nowIso();
  const batch = writeBatch(db);
  batch.set(doc(db, "users", username), {
    username,
    name,
    role,
    active: true,
    mustChangePassword,
    authEmail: auth.email,
    authUid: auth.uid,
    createdAt,
    updatedAt: createdAt,
  });
  batch.set(doc(db, "authUids", auth.uid), { username });
  batch.set(doc(db, "loginDirectory", username), {
    email: auth.email,
    active: true,
    mustChangePassword,
  });
  await batch.commit();

  return {
    id: username,
    username,
    name,
    role,
    must_change_password: mustChangePassword,
    is_active: true,
    created_at: createdAt,
  };
}

export async function createUser(name: string, requestedUsername?: string): Promise<CreatedUser> {
  const db = requireDb();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Inserisci nome e cognome.");

  const rawBase = requestedUsername?.trim() || cleanName;
  const username = requestedUsername?.trim()
    ? normalizeUsername(requestedUsername)
    : await uniqueUsername(rawBase);
  if (!username) throw new Error("Username non valido.");
  if ((await getDoc(doc(db, "users", username))).exists()) {
    throw new Error(`Lo username "${username}" è già in uso.`);
  }

  const initialPassword = `${username}.2026!`;
  const provisioned = await createAuthAccount(username, initialPassword);
  const user = await writeNewUser(username, cleanName, provisioned, "user", true);
  return { user, initial_password: initialPassword };
}

export async function bulkCreateUsers(names: string[]): Promise<BulkCreateResult> {
  const created: CreatedUser[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("it");
    if (seen.has(key)) {
      errors.push(`${name}: duplicato nell'elenco`);
      continue;
    }
    seen.add(key);
    try {
      created.push(await createUser(name));
    } catch (error) {
      errors.push(`${name}: ${friendlyError(error)}`);
    }
  }

  return { created, errors };
}

export async function updateUser(
  username: string,
  patch: { name?: string; is_active?: boolean },
): Promise<User> {
  const db = requireDb();
  const current = await getDoc(doc(db, "users", username));
  if (!current.exists()) throw new Error("Utente non trovato.");
  const currentData = current.data();
  if (currentData.role === "admin" && patch.is_active === false) {
    throw new Error("L'amministratore non può disattivare se stesso.");
  }

  const updates: Record<string, unknown> = { updatedAt: nowIso() };
  if (typeof patch.name === "string" && patch.name.trim()) updates.name = patch.name.trim();
  if (typeof patch.is_active === "boolean") updates.active = patch.is_active;
  await updateDoc(doc(db, "users", username), updates);

  if (typeof patch.is_active === "boolean") {
    await updateDoc(doc(db, "loginDirectory", username), { active: patch.is_active });
  }

  const next = await getDoc(doc(db, "users", username));
  return toUser(username, next.data() ?? {});
}

export async function resetPassword(username: string): Promise<string> {
  const db = requireDb();
  const snap = await getDoc(doc(db, "users", username));
  if (!snap.exists()) throw new Error("Utente non trovato.");
  const data = snap.data();
  if (data.role === "admin") {
    throw new Error("La password dell'amministratore si cambia da Impostazioni.");
  }

  const initialPassword = `${username}.2026!`;
  const provisioned = await createAuthAccount(
    username,
    initialPassword,
    `${username}.reset.${Date.now().toString(36)}`,
  );
  const oldUid = typeof data.authUid === "string" ? data.authUid : null;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", username), {
    authEmail: provisioned.email,
    authUid: provisioned.uid,
    mustChangePassword: true,
    active: true,
    updatedAt: nowIso(),
  });
  batch.set(doc(db, "authUids", provisioned.uid), { username });
  if (oldUid && oldUid !== provisioned.uid) {
    batch.delete(doc(db, "authUids", oldUid));
  }
  batch.set(
    doc(db, "loginDirectory", username),
    {
      email: provisioned.email,
      active: true,
      mustChangePassword: true,
    },
    { merge: true },
  );
  await batch.commit();
  return initialPassword;
}

export async function deleteAttendanceFor(username: string): Promise<number> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, "attendance"), where("username", "==", username)),
  );
  for (let index = 0; index < snap.docs.length; index += 400) {
    const batch = writeBatch(db);
    for (const item of snap.docs.slice(index, index + 400)) batch.delete(item.ref);
    await batch.commit();
  }
  return snap.size;
}

export async function deleteUserData(username: string): Promise<void> {
  const db = requireDb();
  const snap = await getDoc(doc(db, "users", username));
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.role === "admin") {
    throw new Error("L'account amministratore non può essere eliminato da qui.");
  }

  await deleteAttendanceFor(username);
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", username));
  batch.delete(doc(db, "loginDirectory", username));
  if (typeof data.authUid === "string") {
    batch.delete(doc(db, "authUids", data.authUid));
  }
  await batch.commit();
}

export async function deleteOwnAccount(username: string): Promise<void> {
  const user = await getUser(username);
  if (!user) return;
  if (user.role === "admin") {
    throw new Error("L'account amministratore non può essere eliminato dall'app.");
  }
  await deleteAttendanceFor(username);
  const db = requireDb();
  const snap = await getDoc(doc(db, "users", username));
  const authUid = snap.exists() ? snap.data().authUid : null;
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", username));
  batch.delete(doc(db, "loginDirectory", username));
  if (typeof authUid === "string") batch.delete(doc(db, "authUids", authUid));
  await batch.commit();
}

export async function setUserActive(username: string, active: boolean): Promise<User> {
  return updateUser(username, { is_active: active });
}

export async function setUserName(username: string, name: string): Promise<User> {
  return updateUser(username, { name });
}

export async function createAdminBootstrap(
  username: string,
  name: string,
  auth: ProvisionedAuth,
): Promise<User> {
  const db = requireDb();
  const docRef = doc(db, "users", username);
  const existing = await getDoc(docRef);
  if (existing.exists()) {
    throw new Error("Esiste già un amministratore. Usa lo script di bootstrap solo una volta.");
  }
  return writeNewUser(username, name, auth, "admin", false);
}

export async function findAuthEmail(username: string): Promise<string | null> {
  const snap = await getDoc(doc(requireDb(), "loginDirectory", username));
  if (!snap.exists()) return null;
  const email = snap.data().email;
  return typeof email === "string" ? email : null;
}

export async function isActiveDirectory(username: string): Promise<boolean | null> {
  const snap = await getDoc(doc(requireDb(), "loginDirectory", username));
  if (!snap.exists()) return null;
  return snap.data().active !== false;
}

export async function setLoginDirectory(
  username: string,
  email: string,
  active = true,
  mustChangePassword = true,
): Promise<void> {
  await setDoc(doc(requireDb(), "loginDirectory", username), {
    email,
    active,
    mustChangePassword,
  });
}
