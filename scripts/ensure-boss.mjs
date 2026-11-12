/**
 * Creates / confirms Boss user and sets profiles.role = boss.
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY in .env.local
 *
 * Usage: node --env-file=.env.local scripts/ensure-boss.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.env.BOSS_EMAIL || "md@spicetrip.com";
const password = process.env.BOSS_PASSWORD;
const fullName = process.env.BOSS_NAME || "Boss";

if (!url || !secret) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
if (!password) {
  console.error("Set BOSS_PASSWORD in .env.local (do not commit it).");
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  perPage: 200,
});
if (listError) {
  console.error("listUsers failed:", listError.message);
  process.exit(1);
}

let user = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "boss" },
  });
  if (error) {
    console.error("createUser failed:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log("Created boss user", user.id);
} else {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "boss" },
  });
  if (error) {
    console.error("updateUser failed:", error.message);
    process.exit(1);
  }
  console.log("Updated existing boss user", user.id);
}

const { error: profileError } = await admin.from("profiles").upsert({
  id: user.id,
  full_name: fullName,
  role: "boss",
});

if (profileError) {
  console.error(
    "profiles upsert failed (run the SQL migration first):",
    profileError.message,
  );
  process.exit(1);
}

console.log(`Boss ready: ${email}`);
