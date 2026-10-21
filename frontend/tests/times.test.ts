import { describe, expect, it } from "vitest";
import { fmtTime, isTimeInRange } from "../src/date";

// Gli ISO senza suffisso Z vengono interpretati come ora locale, quindi questi
// test non dipendono dal fuso della macchina.
describe("orari delle presenze", () => {
  it("formatta sempre HH:MM a 24 ore con lo zero iniziale", () => {
    expect(fmtTime("2026-10-21T06:05:00")).toBe("06:05");
    expect(fmtTime("2026-10-21T08:30:00")).toBe("08:30");
    expect(fmtTime("2026-10-21T14:00:00")).toBe("14:00");
    expect(fmtTime("2026-10-21T23:59:00")).toBe("23:59");
  });

  it("accetta solo gli orari dentro la lezione, estremi inclusi", () => {
    const from = fmtTime("2026-10-21T08:30:00");
    const until = fmtTime("2026-10-21T10:00:00");

    expect(isTimeInRange(from, from, until)).toBe(true);
    expect(isTimeInRange(until, from, until)).toBe(true);
    expect(isTimeInRange("09:15", from, until)).toBe(true);

    expect(isTimeInRange("08:29", from, until)).toBe(false);
    expect(isTimeInRange("10:01", from, until)).toBe(false);
    expect(isTimeInRange("07:00", from, until)).toBe(false);
    expect(isTimeInRange("23:00", from, until)).toBe(false);
  });
});
