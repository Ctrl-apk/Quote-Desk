import type { IsoDate } from "@/lib/rates/types";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in India (IST), as YYYY-MM-DD (assumption R-07). */
export function todayIst(now: Date = new Date()): IsoDate {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date. */
export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "3 Nov 2026" for display. */
export function formatDate(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

/** "3 Nov 2026, 4:05 pm" in India time, for version history. */
export function formatDateTimeIst(iso: string): string {
  const d = new Date(iso);
  const date = formatDate(todayIst(d));
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  return `${date}, ${time.replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`).replace(/\s+/g, " ")}`;
}
