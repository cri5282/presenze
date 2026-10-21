#!/usr/bin/env node
/**
 * Bootstrap di Firebase per Registro.
 *
 * Crea l'amministratore, gli account degli studenti e importa eventi e presenze
 * dal JSON prodotto da `migration/export-from-sqlite.py`.
 *
 * Produzione:
 *   GOOGLE_APPLICATION_CREDENTIALS=/percorso/service-account.json \
 *   FIREBASE_PROJECT_ID=presenze-xxxxx \
 *   ADMIN_PASSWORD='una-password-lunga' \
 *   npm run bootstrap
 *
 * Emulatori (senza credenziali):
 *   FIREBASE_PROJECT_ID=demo-presenze \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   npm run bootstrap
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const exportPath = resolve(root, "migration/firebase-export.json");
const credentialsPath = resolve(root, "migration/bootstrap-credentials.txt");

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  (process.env.FIREBASE_AUTH_EMULATOR_HOST ? "demo-presenze" : "");
if (!projectId) {
  console.error("Imposta FIREBASE_PROJECT_ID.");
  process.exit(1);
}

const emulator = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
);

function appOptions() {
  if (emulator) return { projectId };
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return { projectId, credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) };
  }
  return { projectId, credential: applicationDefault() };
}

initializeApp(appOptions());
const auth = getAuth();
const db = getFirestore();

const now = new Date().toISOString();

function authEmail(username) {
  return `${username}@presenze.local`;
}

async function ensureAuthUser(username, password, { forcePassword = false } = {}) {
  const email = authEmail(username);
  try {
    const existing = await auth.getUserByEmail(email);
    const passwordChanged = forcePassword || process.env.RESET_PASSWORDS === "true";
    if (passwordChanged) {
      await auth.updateUser(existing.uid, { password });
    }
    return { uid: existing.uid, email, created: false, passwordChanged };
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    const created = await auth.createUser({ email, password });
    return { uid: created.uid, email, created: true, passwordChanged: true };
  }
}

async function writeProfile(username, name, role, authUser, mustChangePassword) {
  const userRef = db.collection("users").doc(username);
  const directoryRef = db.collection("loginDirectory").doc(username);
  const [existingUser, existingDirectory] = await Promise.all([
    userRef.get(),
    directoryRef.get(),
  ]);
  const resetState =
    process.env.RESET_PASSWORDS === "true" || !existingUser.exists;
  const resetDirectoryState =
    process.env.RESET_PASSWORDS === "true" || !existingDirectory.exists;

  const data = {
    username,
    name,
    role,
    authEmail: authUser.email,
    authUid: authUser.uid,
    updatedAt: now,
    ...(resetState
      ? { active: true, mustChangePassword, createdAt: now }
      : {}),
  };
  await userRef.set(data, { merge: true });
  await db.collection("authUids").doc(authUser.uid).set({ username }, { merge: true });
  await directoryRef.set(
    {
      email: authUser.email,
      ...(resetDirectoryState
        ? { active: true, mustChangePassword }
        : {}),
    },
    { merge: true },
  );
  return data;
}

async function main() {
  let exported;
  try {
    exported = JSON.parse(await readFile(exportPath, "utf8"));
  } catch {
    console.error(`File non trovato o non valido: ${exportPath}`);
    console.error("Esegui prima: python3 migration/export-from-sqlite.py");
    process.exit(1);
  }

  const adminUsername = process.env.ADMIN_USERNAME || exported.admin?.username || "admin";
  const adminName = process.env.ADMIN_NAME || exported.admin?.name || "Amministratore";
  const adminPassword =
    process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url") + "!";

  const adminAuth = await ensureAuthUser(adminUsername, adminPassword, {
    forcePassword: Boolean(process.env.ADMIN_PASSWORD),
  });
  await writeProfile(adminUsername, adminName, "admin", adminAuth, false);

  const createdUsers = [];
  for (const user of exported.users ?? []) {
    const username = String(user.username || "").trim();
    if (!username) continue;
    const password = `${username}.2026!`;
    const authUser = await ensureAuthUser(username, password);
    await writeProfile(
      username,
      String(user.name || username),
      "user",
      authUser,
      user.must_change_password !== false,
    );
    createdUsers.push({
      username,
      password,
      passwordChanged: authUser.created || authUser.passwordChanged,
    });
  }

  for (const event of exported.events ?? []) {
    if (!event.legacy_id) continue;
    await db
      .collection("events")
      .doc(`evt_${event.legacy_id}`)
      .set(
        {
          googleEventId: event.google_event_id || "",
          calendarId: event.calendar_id || "primary",
          title: event.title || "(Senza titolo)",
          description: event.description || null,
          location: event.location || null,
          start: event.start,
          end: event.end,
          allDay: Boolean(event.all_day),
          status: event.status || "confirmed",
          htmlLink: event.html_link || null,
          updatedAt: event.updated_at || now,
        },
        { merge: true },
      );
  }

  for (const item of exported.attendance ?? []) {
    if (!item.username || !item.legacy_event_id) continue;
    await db
      .collection("attendance")
      .doc(`${item.username}__evt_${item.legacy_event_id}`)
      .set(
        {
          username: item.username,
          eventId: `evt_${item.legacy_event_id}`,
          status: item.status,
          note: item.note || null,
          entry_time: item.entry_time || null,
          exit_time: item.exit_time || null,
          updated_at: item.updated_at || now,
        },
        { merge: true },
      );
  }

  // Usa i calendari da cui provengono davvero gli eventi importati. In questo
  // modo non finiscono nel registro condiviso calendari personali che
  // l'amministratore aveva selezionato in passato ma che non contengono lezioni.
  const eventCalendarIds = [
    ...new Set(
      (exported.events ?? [])
        .map((event) => event.calendar_id)
        .filter((id) => typeof id === "string" && id.length > 0),
    ),
  ];
  const calendarIds = eventCalendarIds.length
    ? eventCalendarIds
    : exported.admin?.calendar_ids?.length
      ? exported.admin.calendar_ids
      : ["primary"];
  await db
    .collection("settings")
    .doc("calendar")
    .set(
      {
        calendar_ids: calendarIds,
        last_sync_at: exported.admin?.last_sync_at || null,
        updated_at: now,
        updated_by: adminUsername,
      },
      { merge: true },
    );

  const adminPasswordLine =
    adminAuth.created || adminAuth.passwordChanged
      ? `Admin: ${adminUsername} / ${adminPassword}`
      : `Admin: ${adminUsername} / password invariata (usa ADMIN_PASSWORD per reimpostarla)`;
  const lines = [
    "Registro — credenziali generate dal bootstrap Firebase",
    `Progetto: ${projectId}`,
    adminPasswordLine,
    "",
    "Utenti (password iniziale, da cambiare al primo accesso):",
    ...createdUsers.map((user) =>
      user.passwordChanged
        ? `${user.username} / ${user.password}`
        : `${user.username} / password invariata (usa il reset dall'app)`,
    ),
    "",
    "Conserva questo file in locale e non committarlo.",
  ];
  const hasNewCredentials =
    adminAuth.created ||
    adminAuth.passwordChanged ||
    createdUsers.some((user) => user.passwordChanged);

  console.log(lines.join("\n"));
  if (hasNewCredentials) {
    await writeFile(credentialsPath, lines.join("\n") + "\n", { mode: 0o600 });
    console.log(`\nCredenziali salvate in ${credentialsPath}`);
  } else {
    console.log("\nNessuna nuova password generata: il file credenziali non è stato modificato.");
  }
  console.log(
    `Importati: ${exported.events?.length ?? 0} eventi, ${exported.attendance?.length ?? 0} presenze.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
