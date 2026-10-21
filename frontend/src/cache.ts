import type { EventItem } from "./types";

interface CacheEntry {
  at: number;
  events: EventItem[];
}

let cache: CacheEntry | null = null;
const CACHE_MS = 60_000;

export function getCachedEvents(): EventItem[] | null {
  if (!cache) return null;
  if (Date.now() - cache.at > CACHE_MS) return null;
  return cache.events;
}

export function setCachedEvents(events: EventItem[]): void {
  cache = { at: Date.now(), events };
}

export function invalidateEventsCache(): void {
  cache = null;
}
