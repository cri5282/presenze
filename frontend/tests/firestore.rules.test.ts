import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const ADMIN = "adminUid";
const USER1 = "user1Uid";
const USER2 = "user2Uid";
const INACTIVE = "inactiveUid";
const MUST_CHANGE = "mustChangeUid";
const SELF_DELETE = "selfDeleteUid";

function profile(username: string, role: "admin" | "user", extra: Record<string, unknown> = {}) {
  return {
    username,
    name: username,
    role,
    active: true,
    mustChangePassword: false,
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    ...extra,
  };
}

function attendance(username: string, eventId: string, status = "present") {
  return {
    username,
    eventId,
    status,
    note: null,
    entry_time: null,
    exit_time: null,
    updated_at: "2026-10-21T00:00:00Z",
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-presenze",
    firestore: {
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "admin"), profile("admin", "admin"));
    await setDoc(doc(db, "authUids", ADMIN), { username: "admin" });
    await setDoc(doc(db, "loginDirectory", "admin"), {
      email: "admin@presenze.local",
      active: true,
    });

    await setDoc(doc(db, "users", "user1"), profile("user1", "user"));
    await setDoc(doc(db, "authUids", USER1), { username: "user1" });
    await setDoc(doc(db, "loginDirectory", "user1"), {
      email: "user1@presenze.local",
      active: true,
    });

    await setDoc(doc(db, "users", "user2"), profile("user2", "user"));
    await setDoc(doc(db, "authUids", USER2), { username: "user2" });
    await setDoc(doc(db, "loginDirectory", "user2"), {
      email: "user2@presenze.local",
      active: true,
    });

    await setDoc(doc(db, "users", "inactive"), profile("inactive", "user", { active: false }));
    await setDoc(doc(db, "authUids", INACTIVE), { username: "inactive" });

    await setDoc(
      doc(db, "users", "mustchange"),
      profile("mustchange", "user", { mustChangePassword: true }),
    );
    await setDoc(doc(db, "authUids", MUST_CHANGE), { username: "mustchange" });

    await setDoc(
      doc(db, "users", "selfdelete"),
      profile("selfdelete", "user", { authUid: SELF_DELETE }),
    );
    await setDoc(doc(db, "authUids", SELF_DELETE), { username: "selfdelete" });
    await setDoc(doc(db, "loginDirectory", "selfdelete"), {
      email: "selfdelete@presenze.local",
      active: true,
    });

    await setDoc(doc(db, "events", "event1"), {
      googleEventId: "g1",
      calendarId: "primary",
      title: "Matematica",
      start: "2026-10-21T08:00:00Z",
      end: "2026-10-21T09:00:00Z",
      allDay: false,
      status: "confirmed",
      updatedAt: "2026-10-21T00:00:00Z",
    });
    await setDoc(doc(db, "attendance", "user1__event1"), attendance("user1", "event1"));
    await setDoc(doc(db, "settings", "calendar"), {
      calendar_ids: ["primary"],
      last_sync_at: null,
    });
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe("Firestore security rules", () => {
  it("consente la lettura della directory di login solo per documento", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "loginDirectory", "user1")));
    await assertFails(getDocs(collection(anon, "loginDirectory")));
  });

  it("consente a uno studente di leggere il calendario condiviso", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertSucceeds(getDoc(doc(db, "events", "event1")));
    await assertSucceeds(getDoc(doc(db, "settings", "calendar")));
  });

  it("impedisce a uno studente di leggere le presenze altrui", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertFails(getDoc(doc(db, "attendance", "user2__event1")));
    await assertFails(getDocs(collection(db, "attendance")));
  });

  it("consente allo studente di scrivere solo la propria presenza", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertSucceeds(
      setDoc(doc(db, "attendance", "user1__event1"), attendance("user1", "event1", "absent")),
    );
    await assertFails(
      setDoc(doc(db, "attendance", "user2__event1"), attendance("user2", "event1", "present")),
    );
    await assertFails(deleteDoc(doc(db, "attendance", "user2__event1")));
    await assertSucceeds(deleteDoc(doc(db, "attendance", "user1__event1")));
  });

  it("impedisce allo studente di modificare eventi, utenti e impostazioni", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertFails(
      setDoc(doc(db, "events", "event2"), {
        googleEventId: "g2",
        calendarId: "primary",
        title: "Storia",
        start: "2026-10-22T08:00:00Z",
        end: "2026-10-22T09:00:00Z",
        allDay: false,
        status: "confirmed",
        updatedAt: "2026-10-21T00:00:00Z",
      }),
    );
    await assertFails(setDoc(doc(db, "users", "nuovo"), profile("nuovo", "user")));
    await assertFails(updateDoc(doc(db, "users", "user1"), { name: "Cambiato" }));
    await assertFails(updateDoc(doc(db, "settings", "calendar"), { calendar_ids: [] }));
  });

  it("consente allo studente di segnare la password come cambiata", async () => {
    const db = testEnv.authenticatedContext(MUST_CHANGE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", "mustchange"), { mustChangePassword: false }),
    );
  });

  it("blocca le presenze finché la password iniziale non è cambiata", async () => {
    const db = testEnv.authenticatedContext(MUST_CHANGE).firestore();
    await assertFails(
      setDoc(
        doc(db, "attendance", "mustchange__event1"),
        attendance("mustchange", "event1", "present"),
      ),
    );
  });

  it("consente di leggere la propria presenza non ancora esistente, ma non quella altrui", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertSucceeds(getDoc(doc(db, "attendance", "user1__nuovo")));
    await assertFails(getDoc(doc(db, "attendance", "user2__nuovo")));
  });

  it("consente le presenze a un profilo senza il campo mustChangePassword", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const { mustChangePassword: _omit, ...legacy } = profile("legacy", "user");
      await setDoc(doc(db, "users", "legacy"), legacy);
      await setDoc(doc(db, "authUids", "legacyUid"), { username: "legacy" });
    });
    const db = testEnv.authenticatedContext("legacyUid").firestore();
    await assertSucceeds(
      setDoc(doc(db, "attendance", "legacy__event1"), attendance("legacy", "event1", "present")),
    );
  });

  it("blocca gli utenti disattivati", async () => {
    const db = testEnv.authenticatedContext(INACTIVE).firestore();
    await assertFails(getDoc(doc(db, "events", "event1")));
    await assertFails(
      setDoc(doc(db, "attendance", "inactive__event1"), attendance("inactive", "event1")),
    );
  });

  it("consente all'amministratore di gestire eventi, utenti e presenze", async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(
      setDoc(doc(db, "events", "event2"), {
        googleEventId: "g2",
        calendarId: "primary",
        title: "Storia",
        start: "2026-10-22T08:00:00Z",
        end: "2026-10-22T09:00:00Z",
        allDay: false,
        status: "confirmed",
        updatedAt: "2026-10-21T00:00:00Z",
      }),
    );
    await assertSucceeds(setDoc(doc(db, "users", "nuovo"), profile("nuovo", "user")));
    await assertSucceeds(getDoc(doc(db, "attendance", "user1__event1")));
    await assertSucceeds(updateDoc(doc(db, "settings", "calendar"), { calendar_ids: ["primary"] }));
    await assertSucceeds(
      setDoc(doc(db, "attendance", "user2__event1"), attendance("user2", "event1", "excused")),
    );
  });

  it("consente allo studente di eliminare il proprio account in un batch", async () => {
    const db = testEnv.authenticatedContext(SELF_DELETE).firestore();
    await assertSucceeds(
      (async () => {
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", "selfdelete"));
        batch.delete(doc(db, "loginDirectory", "selfdelete"));
        batch.delete(doc(db, "authUids", SELF_DELETE));
        await batch.commit();
      })(),
    );
  });

  it("impedisce allo studente di accedere alle mappe auth e ai token di sync", async () => {
    const db = testEnv.authenticatedContext(USER1).firestore();
    await assertFails(getDoc(doc(db, "authUids", USER2)));
    await assertFails(getDoc(doc(db, "syncState", "primary")));
  });
});
