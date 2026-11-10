import { APP_TIMEZONE } from "@/lib/config";

function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - date.getTime();
}

/** "2026-11-07T18:30" typed in the app time zone → UTC ISO string. */
export function zonedInputToIso(value: string, tz: string = APP_TIMEZONE): string {
  const asUtc = new Date(`${value}:00Z`);
  return new Date(asUtc.getTime() - offsetMs(asUtc, tz)).toISOString();
}

/** UTC ISO string → value for <input type="datetime-local"> in the app time zone. */
export function isoToZonedInput(iso: string, tz: string = APP_TIMEZONE): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ar-u-nu-latn", {
    dateStyle: "medium", timeStyle: "short", timeZone: APP_TIMEZONE,
  }).format(new Date(iso));
}

/** For `date` columns (YYYY-MM-DD) — no time zone shifting. */
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

/** Today's date (YYYY-MM-DD) in the app time zone, for comparing with `date` columns. */
export function todayLocal(tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
