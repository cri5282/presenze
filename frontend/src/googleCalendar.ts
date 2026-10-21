import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { googleClientId, isGoogleConfigured, requireDb } from "./firebase";
import { invalidateEventsCache } from "./cache";
import { requireSessionUsername } from "./session";
import type {
  CalendarInfo,
  CalendarSettings,
  SyncResult,
  SyncStatus,
} from "./types";

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_SAFETY_MS = 60_000;
const INITIAL_DAYS_BACK = 180;
const INITIAL_DAYS_FORWARD = 90;

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface GoogleCalendarListResponse {
  items?: Array<{
    id: string;
    summary?: string;
    primary?: boolean;
    backgroundColor?: string;
  }>;
}

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
}

interface GoogleEventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  error?: { message?: string };
}

let cachedToken: CachedToken | null = null;
let scriptPromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity non disponibile.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossibile caricare Google Identity."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function requestToken(interactivePrompt: string): Promise<string> {
  if (!isGoogleConfigured) {
    throw new Error(
      "Google Calendar non configurato. Imposta VITE_GOOGLE_CLIENT_ID durante la build.",
    );
  }
  return new Promise((resolve, reject) => {
    void ensureGoogleScript()
      .then(() => {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error("Google Identity non disponibile."));
          return;
        }
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(
                new Error(
                  response.error_description ||
                    "Autorizzazione Google annullata o non riuscita.",
                ),
              );
              return;
            }
            const expiresIn = Number(response.expires_in || 3600);
            cachedToken = {
              token: response.access_token,
              expiresAt: Date.now() + Math.max(30, expiresIn - TOKEN_SAFETY_MS / 1000) * 1000,
            };
            resolve(response.access_token);
          },
          error_callback: (error) => {
            reject(new Error(error.message || "Autorizzazione Google non riuscita."));
          },
        });
        client.requestAccessToken({ prompt: interactivePrompt });
      })
      .catch(reject);
  });
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  // La sincronizzazione è manuale: se il token non è in memoria chiediamo
  // esplicitamente il consenso, così il browser non blocca il popup.
  return requestToken("consent");
}

async function forceAccessToken(): Promise<string> {
  cachedToken = null;
  return requestToken("consent");
}

async function googleFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    cachedToken = null;
    throw new Error("Autorizzazione Google scaduta. Ricollega il calendario.");
  }
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ||
      `Google Calendar ha risposto ${response.status}.`;
    throw new Error(message);
  }
  if (!data) throw new Error("Risposta vuota da Google Calendar.");
  return data;
}

export async function connectGoogle(): Promise<CalendarInfo[]> {
  await forceAccessToken();
  return listGoogleCalendars();
}

export async function listGoogleCalendars(): Promise<CalendarInfo[]> {
  const token = await accessToken();
  const data = await googleFetch<GoogleCalendarListResponse>(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
    token,
  );
  return (data.items ?? []).map((item) => ({
    id: item.primary ? "primary" : item.id,
    summary: item.primary ? `${item.summary || "Calendario"} (principale)` : item.summary || item.id,
    primary: item.primary === true,
    background_color: item.backgroundColor ?? null,
  }));
}

function calendarSettingsFromData(data: Record<string, unknown>): CalendarSettings {
  const ids = Array.isArray(data.calendar_ids)
    ? data.calendar_ids.filter((item): item is string => typeof item === "string")
    : [];
  return {
    calendar_ids: ids,
    last_sync_at: typeof data.last_sync_at === "string" ? data.last_sync_at : null,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
    updated_by: typeof data.updated_by === "string" ? data.updated_by : null,
  };
}

export async function getCalendarSettings(): Promise<CalendarSettings> {
  const snap = await getDoc(doc(requireDb(), "settings", "calendar"));
  if (!snap.exists()) {
    return { calendar_ids: ["primary"], last_sync_at: null, updated_at: null, updated_by: null };
  }
  return calendarSettingsFromData(snap.data());
}

export async function saveCalendarSettings(calendarIds: string[]): Promise<CalendarSettings> {
  const clean = [...new Set(calendarIds.map((id) => id.trim()).filter(Boolean))];
  if (!clean.length) throw new Error("Seleziona almeno un calendario.");
  const db = requireDb();
  const username = requireSessionUsername();
  await setDoc(
    doc(db, "settings", "calendar"),
    {
      calendar_ids: clean,
      updated_at: nowIso(),
      updated_by: username,
    },
    { merge: true },
  );
  // Gli eventi dei calendari deselezionati restano nel database ma vengono
  // filtrati in lettura: se il calendario viene riaggiunto, le presenze già
  // registrate non vanno perse.
  invalidateEventsCache();
  return getCalendarSettings();
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = await getCalendarSettings();
  return {
    google_configured: isGoogleConfigured,
    connected: Boolean(cachedToken && cachedToken.expiresAt > Date.now()),
    last_sync_at: settings.last_sync_at,
    calendar_count: settings.calendar_ids.length,
  };
}

function parseEventDate(value: GoogleEventDateTime | undefined): {
  start: string;
  end: string;
  allDay: boolean;
} | null {
  if (!value) return null;
  if (value.date) {
    const start = `${value.date}T00:00:00Z`;
    const endDate = new Date(`${value.date}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    return { start, end: endDate.toISOString(), allDay: true };
  }
  if (value.dateTime) {
    const start = new Date(value.dateTime);
    if (Number.isNaN(start.getTime())) return null;
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      allDay: false,
    };
  }
  return null;
}

async function ensureAdmin(): Promise<string> {
  const username = requireSessionUsername();
  const snap = await getDoc(doc(requireDb(), "users", username));
  if (!snap.exists() || snap.data().role !== "admin") {
    throw new Error("Solo l'amministratore può sincronizzare il calendario condiviso.");
  }
  return username;
}

async function applyEvent(
  calendarId: string,
  item: GoogleCalendarEvent,
  existing: Map<string, string>,
): Promise<boolean> {
  const googleId = item.id;
  if (!googleId) return false;
  const db = requireDb();
  const key = `${calendarId}|${googleId}`;
  const existingId = existing.get(key);

  if (item.status === "cancelled") {
    if (existingId) {
      await deleteDoc(doc(db, "events", existingId));
      existing.delete(key);
      return true;
    }
    return false;
  }

  const startInfo = parseEventDate(item.start);
  if (!startInfo) return false;
  const endInfo = parseEventDate(item.end);
  const start = startInfo.start;
  const end = endInfo?.start ?? startInfo.end;
  const title = (item.summary || "").trim() || "(Senza titolo)";
  const values = {
    googleEventId: googleId,
    calendarId,
    title: title.slice(0, 500),
    description: item.description || null,
    location: item.location || null,
    start,
    end,
    allDay: startInfo.allDay,
    status: item.status || "confirmed",
    htmlLink: item.htmlLink || null,
    updatedAt: nowIso(),
  };

  if (existingId) {
    await updateDoc(doc(db, "events", existingId), values);
  } else {
    const created = await addDoc(collection(db, "events"), values);
    existing.set(key, created.id);
  }
  return true;
}

export async function syncSharedCalendar(): Promise<SyncResult> {
  const username = await ensureAdmin();
  if (!isGoogleConfigured) {
    return {
      ok: false,
      events_processed: 0,
      calendars_synced: 0,
      errors: ["Google Calendar non configurato."],
      last_sync_at: null,
    };
  }

  let token: string;
  try {
    token = await accessToken();
  } catch (error) {
    return {
      ok: false,
      events_processed: 0,
      calendars_synced: 0,
      errors: [error instanceof Error ? error.message : "Autorizzazione Google non riuscita."],
      last_sync_at: null,
    };
  }

  const db = requireDb();
  const settings = await getCalendarSettings();
  const calendarIds = settings.calendar_ids.length ? settings.calendar_ids : ["primary"];
  const errors: string[] = [];
  let processed = 0;
  let synced = 0;

  const existingSnap = await getDocs(collection(db, "events"));
  const existing = new Map<string, string>();
  for (const item of existingSnap.docs) {
    const data = item.data();
    if (typeof data.calendarId === "string" && typeof data.googleEventId === "string") {
      existing.set(`${data.calendarId}|${data.googleEventId}`, item.id);
    }
  }

  const timeMin = new Date(Date.now() - INITIAL_DAYS_BACK * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + INITIAL_DAYS_FORWARD * 86_400_000).toISOString();

  for (const calendarId of calendarIds) {
    const stateRef = doc(db, "syncState", encodeURIComponent(calendarId));
    try {
      const stateSnap = await getDoc(stateRef);
      let syncToken =
        stateSnap.exists() && typeof stateSnap.data().syncToken === "string"
          ? (stateSnap.data().syncToken as string)
          : null;
      let pageToken: string | null = null;
      let nextSyncToken: string | null = null;
      let retried = false;

      while (true) {
        const params = new URLSearchParams({
          maxResults: "2500",
          singleEvents: "true",
          showDeleted: "true",
        });
        if (syncToken) {
          params.set("syncToken", syncToken);
        } else {
          params.set("timeMin", timeMin);
          params.set("timeMax", timeMax);
        }
        if (pageToken) params.set("pageToken", pageToken);

        const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
        let page: GoogleEventsResponse;
        try {
          page = await googleFetch<GoogleEventsResponse>(url, token);
        } catch (error) {
          if (error instanceof Error && /410|sync token/i.test(error.message) && !retried) {
            retried = true;
            syncToken = null;
            pageToken = null;
            await setDoc(stateRef, { syncToken: null, lastSyncAt: nowIso() }, { merge: true });
            continue;
          }
          throw error;
        }

        for (const item of page.items ?? []) {
          if (await applyEvent(calendarId, item, existing)) processed += 1;
        }

        pageToken = page.nextPageToken ?? null;
        if (!pageToken) {
          nextSyncToken = page.nextSyncToken ?? syncToken;
          break;
        }
      }

      const syncedAt = nowIso();
      await setDoc(
        stateRef,
        { calendarId, syncToken: nextSyncToken, lastSyncAt: syncedAt },
        { merge: true },
      );
      synced += 1;
    } catch (error) {
      errors.push(
        `${calendarId}: ${error instanceof Error ? error.message : "sincronizzazione non riuscita"}`,
      );
    }
  }

  const lastSyncAt = synced > 0 ? nowIso() : settings.last_sync_at;
  if (synced > 0) {
    await setDoc(
      doc(db, "settings", "calendar"),
      {
        calendar_ids: calendarIds,
        last_sync_at: lastSyncAt,
        updated_at: lastSyncAt,
        updated_by: username,
      },
      { merge: true },
    );
    invalidateEventsCache();
  }

  return {
    ok: synced > 0,
    events_processed: processed,
    calendars_synced: synced,
    errors,
    last_sync_at: lastSyncAt,
  };
}
