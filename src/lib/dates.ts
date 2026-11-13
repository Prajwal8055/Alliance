const TIMEZONE =
  process.env.NEXT_PUBLIC_CASHBOOK_TIMEZONE ?? "America/Los_Angeles";

export function getCashbookTimezone() {
  return TIMEZONE;
}

/** Calendar date YYYY-MM-DD in cash book timezone */
export function todayBookDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a YYYY-MM-DD book date by whole calendar days (local civil date). */
export function shiftBookDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Minutes since local midnight in cash book timezone */
export function localMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // en-US hour12:false can yield "24" for midnight in some engines
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

export const CLOSE_MINUTES = 18 * 60 + 30; // 6:30 PM

export function isPastCloseTime(now = new Date()): boolean {
  return localMinutesNow(now) >= CLOSE_MINUTES;
}

export function formatMoney(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number.isFinite(n) ? n : 0);
}

export function remainingEditMs(editableUntil: string, now = Date.now()): number {
  return Math.max(0, new Date(editableUntil).getTime() - now);
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
