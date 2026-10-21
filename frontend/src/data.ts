import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { requireDb } from "./firebase";
import { getCachedEvents, setCachedEvents } from "./cache";
import { requireSessionUsername } from "./session";
import {
  bulkCreateUsers,
  createUser,
  deleteUserData,
  getUser,
  listUsers,
  resetPassword,
  updateUser,
} from "./users";
import { friendlyError } from "./errors";
import {
  isCancelled,
  type Attendance,
  type AttendanceStatus,
  type BulkCreateResult,
  type CalendarInfo,
  type CalendarSettings,
  type CreatedUser,
  type EventItem,
  type Stats,
  type SyncResult,
  type SyncStatus,
  type User,
} from "./types";
import {
  connectGoogle,
  getCalendarSettings,
  getSyncStatus,
  listGoogleCalendars,
  saveCalendarSettings,
  syncSharedCalendar,
} from "./googleCalendar";

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function eventFromSnapshot(
  snapshot: DocumentSnapshot | QueryDocumentSnapshot,
  attendance: Attendance | null = null,
): EventItem {
  const data = snapshot.data() ?? {};
  const start = asString(data.start);
  const startMs = new Date(start).getTime();
  const fallbackEnd = Number.isFinite(startMs)
    ? new Date(startMs + 60 * 60 * 1000).toISOString()
    : "";
  return {
    id: snapshot.id,
    google_event_id: asString(data.googleEventId),
    calendar_id: asString(data.calendarId),
    title: asString(data.title, "(Senza titolo)"),
    description: asNullableString(data.description),
    location: asNullableString(data.location),
    start,
    end: asString(data.end, fallbackEnd),
    all_day: data.allDay === true,
    status: asString(data.status, "confirmed"),
    html_link: asNullableString(data.htmlLink),
    attendance,
  };
}

function attendanceFromData(data: Record<string, unknown>): Attendance {
  const status = data.status;
  return {
    status: status === "present" || status === "absent" ? status : "absent",
    note: asNullableString(data.note),
    entry_time: asNullableString(data.entry_time),
    exit_time: asNullableString(data.exit_time),
    updated_at: asString(data.updated_at, nowIso()),
  };
}

async function readBaseEvents(): Promise<EventItem[]> {
  const cached = getCachedEvents();
  if (cached) return cached;
  const [snap, settings] = await Promise.all([
    getDocs(collection(requireDb(), "events")),
    getCalendarSettings(),
  ]);
  const allowedCalendars = new Set(
    settings.calendar_ids.length ? settings.calendar_ids : ["primary"],
  );
  const events = snap.docs
    .map((item) => eventFromSnapshot(item))
    .filter(
      (event) => Boolean(event.start) && allowedCalendars.has(event.calendar_id),
    )
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  setCachedEvents(events);
  return events;
}

async function readAttendance(username: string): Promise<Map<string, Attendance>> {
  const snap = await getDocs(
    query(collection(requireDb(), "attendance"), where("username", "==", username)),
  );
  const result = new Map<string, Attendance>();
  for (const item of snap.docs) {
    const data = item.data();
    const eventId = asString(data.eventId);
    if (eventId) result.set(eventId, attendanceFromData(data));
  }
  return result;
}

function overlaps(event: EventItem, from: Date, to: Date): boolean {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < to.getTime() && end > from.getTime();
}

async function eventsWithAttendance(
  from: Date,
  to: Date,
  targetUsername?: string,
): Promise<EventItem[]> {
  const username = targetUsername || requireSessionUsername();
  const [base, attendance] = await Promise.all([readBaseEvents(), readAttendance(username)]);
  return base
    .filter((event) => overlaps(event, from, to))
    .map((event) => ({ ...event, attendance: attendance.get(event.id) ?? null }));
}

function computeStats(
  events: EventItem[],
  from: Date,
  to: Date,
): Stats {
  const now = Date.now();
  const totals = { present: 0, absent: 0, unmarked: 0 };
  const groups = new Map<string, { title: string; present: number; absent: number; unmarked: number }>();

  for (const event of events) {
    if (event.all_day || isCancelled(event)) continue;
    if (!overlaps(event, from, to)) continue;
    const key = event.title.trim().toLocaleLowerCase("it") || "(senza titolo)";
    const group = groups.get(key) ?? {
      title: event.title.trim() || "(Senza titolo)",
      present: 0,
      absent: 0,
      unmarked: 0,
    };
    if (event.attendance) {
      const status = event.attendance.status;
      totals[status] += 1;
      group[status] += 1;
    } else if (new Date(event.end).getTime() < now) {
      totals.unmarked += 1;
      group.unmarked += 1;
    }
    groups.set(key, group);
  }

  const marked = totals.present + totals.absent;
  const total = marked + totals.unmarked;
  const rate = marked ? Math.round((totals.present / marked) * 1000) / 10 : 0;
  const groupStats = [...groups.values()]
    .map((group) => {
      const groupMarked = group.present + group.absent;
      const groupTotal = groupMarked + group.unmarked;
      return {
        title: group.title,
        present: group.present,
        absent: group.absent,
        unmarked: group.unmarked,
        total: groupTotal,
        rate: groupMarked ? Math.round((group.present / groupMarked) * 1000) / 10 : 0,
      };
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "it"));

  return {
    range_from: from.toISOString(),
    range_to: to.toISOString(),
    present: totals.present,
    absent: totals.absent,
    unmarked: totals.unmarked,
    marked,
    total,
    rate,
    groups: groupStats,
  };
}

function attendanceDocId(username: string, eventId: string): string {
  return `${username}__${eventId}`;
}

export const api = {
  events: (from: Date, to: Date, targetUsername?: string): Promise<EventItem[]> =>
    eventsWithAttendance(from, to, targetUsername),

  setAttendance: async (
    eventId: string,
    status: AttendanceStatus,
    times?: { entry_time: string | null; exit_time: string | null },
  ): Promise<EventItem> => {
    const db = requireDb();
    const username = requireSessionUsername();
    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    if (!eventSnap.exists()) throw new Error("Evento non trovato.");
    const event = eventFromSnapshot(eventSnap);
    if (event.all_day) throw new Error("Gli eventi di tutto il giorno non si registrano.");

    const attendanceRef = doc(db, "attendance", attendanceDocId(username, eventId));
    const existingSnap = await getDoc(attendanceRef);
    const existing = existingSnap.exists()
      ? attendanceFromData(existingSnap.data())
      : null;
    const entry = times ? times.entry_time : existing?.entry_time ?? null;
    const exit = times ? times.exit_time : existing?.exit_time ?? null;
    if (entry && exit && entry >= exit) {
      throw new Error("L'orario di uscita deve essere successivo a quello di entrata.");
    }

    const attendance: Attendance = {
      status,
      note: existing?.note ?? null,
      entry_time: entry,
      exit_time: exit,
      updated_at: nowIso(),
    };
    await setDoc(attendanceRef, {
      username,
      eventId,
      status: attendance.status,
      note: attendance.note,
      entry_time: attendance.entry_time,
      exit_time: attendance.exit_time,
      updated_at: attendance.updated_at,
    });
    return { ...event, attendance };
  },

  clearAttendance: async (eventId: string): Promise<void> => {
    const username = requireSessionUsername();
    await deleteDoc(doc(requireDb(), "attendance", attendanceDocId(username, eventId)));
  },

  stats: async (from: Date, to: Date, targetUsername?: string): Promise<Stats> => {
    const events = await eventsWithAttendance(from, to, targetUsername);
    return computeStats(events, from, to);
  },

  adminUsers: (): Promise<User[]> => listUsers(),
  adminUser: (username: string): Promise<User | null> => getUser(username),
  createUser: (name: string, username?: string): Promise<CreatedUser> => createUser(name, username),
  bulkCreateUsers: (names: string[]): Promise<BulkCreateResult> => bulkCreateUsers(names),
  updateUser: (username: string, patch: { name?: string; is_active?: boolean }): Promise<User> =>
    updateUser(username, patch),
  resetPassword: (username: string): Promise<string> => resetPassword(username),
  deleteUser: (username: string): Promise<void> => deleteUserData(username),

  checkSetup: async (): Promise<boolean> => {
    const snap = await getDoc(doc(requireDb(), "loginDirectory", "admin"));
    return snap.exists();
  },

  calendarSettings: (): Promise<CalendarSettings> => getCalendarSettings(),
  saveCalendars: (calendarIds: string[]): Promise<CalendarSettings> =>
    saveCalendarSettings(calendarIds),
  calendars: (): Promise<CalendarInfo[]> => listGoogleCalendars(),
  connectGoogle: (): Promise<CalendarInfo[]> => connectGoogle(),
  sync: (): Promise<SyncResult> => syncSharedCalendar(),
  syncStatus: (): Promise<SyncStatus> => getSyncStatus(),
};

export { friendlyError };
