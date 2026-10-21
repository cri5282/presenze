export type AttendanceStatus = "present" | "absent" | "excused";

export interface Attendance {
  status: AttendanceStatus;
  note: string | null;
  entry_time: string | null;
  exit_time: string | null;
  updated_at: string;
}

export interface EventItem {
  id: number;
  google_event_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  all_day: boolean;
  status: string;
  html_link: string | null;
  attendance: Attendance | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  selected_calendars: string[];
  needs_reauth: boolean;
  last_sync_at: string | null;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  background_color: string | null;
}

export interface GroupStats {
  title: string;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
  total: number;
  rate: number;
}

export interface Stats {
  range_from: string;
  range_to: string;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
  marked: number;
  total: number;
  rate: number;
  groups: GroupStats[];
}

export interface SyncResult {
  ok: boolean;
  events_processed: number;
  calendars_synced: number;
  errors: string[];
  last_sync_at: string | null;
}
