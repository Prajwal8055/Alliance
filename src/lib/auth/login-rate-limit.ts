import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

export type LoginGate =
  | { ok: true; failedCount: number }
  | { ok: false; lockedUntil: string; retryAfterSec: number };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function checkLoginAllowed(email: string): Promise<LoginGate> {
  const admin = createAdminClient();
  const key = normalizeEmail(email);

  const { data, error } = await admin
    .from("login_attempts")
    .select("failed_count, locked_until")
    .eq("email", key)
    .maybeSingle();

  if (error) {
    // If the migration is missing, fail open for availability but log-like via throw upstream only on write
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      return { ok: true, failedCount: 0 };
    }
    throw new Error(error.message);
  }

  if (!data?.locked_until) {
    return { ok: true, failedCount: data?.failed_count ?? 0 };
  }

  const lockedUntilMs = new Date(data.locked_until).getTime();
  const now = Date.now();
  if (lockedUntilMs > now) {
    return {
      ok: false,
      lockedUntil: data.locked_until,
      retryAfterSec: Math.ceil((lockedUntilMs - now) / 1000),
    };
  }

  // Lock expired — clear so the user gets a fresh set of attempts
  await admin.from("login_attempts").delete().eq("email", key);
  return { ok: true, failedCount: 0 };
}

export async function recordLoginFailure(email: string): Promise<{
  failedCount: number;
  lockedUntil: string | null;
  remaining: number;
}> {
  const admin = createAdminClient();
  const key = normalizeEmail(email);
  const now = new Date();

  const { data: existing, error: readError } = await admin
    .from("login_attempts")
    .select("failed_count, locked_until")
    .eq("email", key)
    .maybeSingle();

  if (readError) {
    if (readError.code === "42P01" || /does not exist|schema cache/i.test(readError.message)) {
      return { failedCount: 1, lockedUntil: null, remaining: MAX_LOGIN_ATTEMPTS - 1 };
    }
    throw new Error(readError.message);
  }

  if (existing?.locked_until && new Date(existing.locked_until).getTime() > now.getTime()) {
    return {
      failedCount: existing.failed_count,
      lockedUntil: existing.locked_until,
      remaining: 0,
    };
  }

  const failedCount = (existing?.failed_count ?? 0) + 1;
  const lockedUntil =
    failedCount >= MAX_LOGIN_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MS).toISOString()
      : null;

  const { error: writeError } = await admin.from("login_attempts").upsert({
    email: key,
    failed_count: failedCount,
    locked_until: lockedUntil,
    updated_at: now.toISOString(),
  });

  if (writeError) {
    if (writeError.code === "42P01" || /does not exist|schema cache/i.test(writeError.message)) {
      return {
        failedCount,
        lockedUntil,
        remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - failedCount),
      };
    }
    throw new Error(writeError.message);
  }

  return {
    failedCount,
    lockedUntil,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - failedCount),
  };
}

export async function clearLoginFailures(email: string): Promise<void> {
  const admin = createAdminClient();
  const key = normalizeEmail(email);
  const { error } = await admin.from("login_attempts").delete().eq("email", key);
  if (error && error.code !== "42P01" && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export function formatLockMessage(retryAfterSec: number) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many failed sign-in attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}
