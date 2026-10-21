const LOCALE = "it-IT";

export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Giorno locale in cui cade un evento; per gli eventi "tutto il giorno" usa la data pura. */
export function eventDayKey(event: { start: string; all_day: boolean }): string {
  return event.all_day ? event.start.slice(0, 10) : localDateKey(new Date(event.start));
}

/**
 * Un evento "tutto il giorno" copre una data pura (YYYY-MM-DD), con fine esclusa.
 * Le date non vanno convertite in UTC, altrimenti l'evento sconfina nel giorno dopo.
 */
export function allDayIncludes(
  event: { start: string; end: string; all_day: boolean },
  dayKey: string,
): boolean {
  return (
    event.all_day && event.start.slice(0, 10) <= dayKey && event.end.slice(0, 10) > dayKey
  );
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), diff);
}

/** Griglia di 6 settimane (42 giorni) che contiene il mese. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeekMonday(startOfMonth(month));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

// Confronto lessicografico: fmtTime produce sempre "HH:MM" a 24 ore con zero
// iniziale, quindi l'ordinamento delle stringhe coincide con quello temporale.
export function isTimeInRange(value: string, from: string, until: string): boolean {
  return value >= from && value <= until;
}

export function fmtEventRange(event: { start: string; end: string; all_day: boolean }): string {
  if (event.all_day) return "Tutto il giorno";
  const start = fmtTime(event.start);
  const end = fmtTime(event.end);
  return start === end ? start : `${start} – ${end}`;
}

export function fmtDayLong(date: Date): string {
  return capitalize(
    new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(date),
  );
}

export function fmtFullDate(date: Date): string {
  return capitalize(
    new Intl.DateTimeFormat(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
  );
}

export function fmtMonth(date: Date): string {
  return capitalize(
    new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(date),
  );
}

export function fmtShort(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(date);
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Buonanotte";
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "mai";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 45_000) return "adesso";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
