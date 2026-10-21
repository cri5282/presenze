import type {
  AttendanceStatus,
  CalendarInfo,
  EventItem,
  Stats,
  SyncResult,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Server non raggiungibile. Controlla la connessione.", 0);
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event("presenze:unauthorized"));
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.detail || "Sessione scaduta", 401);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail =
      typeof data?.detail === "string" ? data.detail : `Errore del server (${response.status})`;
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const q = (value: string) => encodeURIComponent(value);

export const api = {
  me: () => request<User>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  deleteAccount: () => request<{ ok: boolean }>("/account", { method: "DELETE" }),

  events: (from: Date, to: Date) =>
    request<EventItem[]>(`/events?from=${q(from.toISOString())}&to=${q(to.toISOString())}`),

  setAttendance: (
    eventId: number,
    status: AttendanceStatus,
    times?: { entry_time: string | null; exit_time: string | null },
  ) =>
    request<EventItem>(`/events/${eventId}/attendance`, {
      method: "PUT",
      body: JSON.stringify(times ? { status, ...times } : { status }),
    }),

  clearAttendance: (eventId: number) =>
    request<void>(`/events/${eventId}/attendance`, { method: "DELETE" }),

  stats: (from: Date, to: Date) =>
    request<Stats>(`/stats?from=${q(from.toISOString())}&to=${q(to.toISOString())}`),

  calendars: () => request<CalendarInfo[]>("/calendars"),

  updateSettings: (calendarIds: string[]) =>
    request<User>("/settings", {
      method: "PUT",
      body: JSON.stringify({ calendar_ids: calendarIds }),
    }),

  sync: () => request<SyncResult>("/sync", { method: "POST" }),
};
