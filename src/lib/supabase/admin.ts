import { createClient } from "@supabase/supabase-js";

/** Admin client (bypasses RLS). Requires SUPABASE_SECRET_KEY in env. */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL");
  }
  if (!secret) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Paste the full secret key into .env.local from Supabase → API Keys.",
    );
  }

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
