import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireBoss(): Promise<
  { ok: true; profile: Profile } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Not signed in" };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return { ok: false, status: 403, error: "Profile not found" };
  }

  if (profile.role !== "boss") {
    return { ok: false, status: 403, error: "Only Boss can manage users" };
  }

  return { ok: true, profile: profile as Profile };
}
