import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  checkLoginAllowed,
  clearLoginFailures,
  formatLockMessage,
  MAX_LOGIN_ATTEMPTS,
  recordLoginFailure,
} from "@/lib/auth/login-rate-limit";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

/**
 * Server-side sign-in with rate limiting.
 * Passwords are verified by Supabase Auth (bcrypt + salt).
 * Session cookies are written onto the JSON response so the browser stays signed in.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  try {
    const gate = await checkLoginAllowed(email);
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: formatLockMessage(gate.retryAfterSec),
          lockedUntil: gate.lockedUntil,
          retryAfterSec: gate.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(gate.retryAfterSec) },
        },
      );
    }

    const cookieStore = await cookies();
    const pendingCookies: CookieToSet[] = [];

    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabasePublishableKey(),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                cookieStore.set(name, value, options);
              } catch {
                // Ignore if the cookie store rejects writes; we still attach to the response.
              }
              pendingCookies.push({ name, value, options });
            });
          },
        },
      },
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      const failure = await recordLoginFailure(email);
      if (failure.lockedUntil) {
        const retryAfterSec = Math.ceil(
          (new Date(failure.lockedUntil).getTime() - Date.now()) / 1000,
        );
        return NextResponse.json(
          {
            error: formatLockMessage(retryAfterSec),
            lockedUntil: failure.lockedUntil,
            retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
          },
        );
      }

      return NextResponse.json(
        {
          error: `Invalid email or password. ${failure.remaining} attempt${
            failure.remaining === 1 ? "" : "s"
          } remaining.`,
          remaining: failure.remaining,
          maxAttempts: MAX_LOGIN_ATTEMPTS,
        },
        { status: 401 },
      );
    }

    await clearLoginFailures(email);

    const response = NextResponse.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });

    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-in failed" },
      { status: 500 },
    );
  }
}
