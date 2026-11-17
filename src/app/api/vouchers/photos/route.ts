import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Batch-check which voucher IDs have bill photos.
 * Body: { items: { id: string; created_by: string }[] }
 * Returns: { photos: Record<string, true> }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { items?: { id: string; created_by: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = (body.items ?? []).slice(0, 200);
  if (items.length === 0) {
    return NextResponse.json({ photos: {} });
  }

  const admin = createAdminClient();
  const photos: Record<string, true> = {};

  // Prefer DB column when migration 021 is applied
  const ids = items.map((i) => i.id);
  const { data: withPath, error: pathError } = await admin
    .from("vouchers")
    .select("id, photo_path")
    .in("id", ids);

  if (!pathError && withPath) {
    for (const row of withPath as { id: string; photo_path?: string | null }[]) {
      if (row.photo_path) photos[row.id] = true;
    }
  }

  // Fallback: storage convention created_by/id.jpg for rows still missing
  const missing = items.filter((i) => !photos[i.id]);
  const byOwner = new Map<string, string[]>();
  for (const item of missing) {
    const list = byOwner.get(item.created_by) ?? [];
    list.push(item.id);
    byOwner.set(item.created_by, list);
  }

  for (const [owner, ownerIds] of byOwner) {
    const { data: files } = await admin.storage.from("voucher-photos").list(owner, {
      limit: 1000,
    });
    const names = new Set((files ?? []).map((f) => f.name));
    for (const id of ownerIds) {
      if (names.has(`${id}.jpg`)) photos[id] = true;
    }
  }

  return NextResponse.json({ photos });
}
