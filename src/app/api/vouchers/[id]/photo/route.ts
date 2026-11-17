import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VOUCHER_PHOTO_BUCKET, voucherPhotoObjectPath } from "@/lib/voucher-photo";

type Params = { params: Promise<{ id: string }> };

const MAX_UPLOAD_BYTES = 512 * 1024; // post-compression cap

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false as const, status: 401 as const, error: "Not signed in" };
  }
  return { ok: true as const, user, supabase };
}

/** Upload bill photo once at voucher create (multipart field "photo"). */
export async function POST(request: Request, { params }: Params) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: voucher, error: voucherError } = await admin
    .from("vouchers")
    .select("id, created_by, photo_path")
    .eq("id", id)
    .maybeSingle();

  // photo_path may be missing until migration 021 — tolerate either shape
  if (voucherError && !/photo_path|column/i.test(voucherError.message)) {
    return NextResponse.json({ error: voucherError.message }, { status: 500 });
  }

  let row = voucher as { id: string; created_by: string; photo_path?: string | null } | null;
  if (!row) {
    const { data: fallback, error: fbErr } = await admin
      .from("vouchers")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();
    if (fbErr || !fallback) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }
    row = fallback;
  }

  if (row.created_by !== gate.user.id) {
    return NextResponse.json(
      { error: "Only the creator can attach a photo at create time" },
      { status: 403 },
    );
  }

  if (row.photo_path) {
    return NextResponse.json(
      { error: "Photo already attached; cannot change after create" },
      { status: 409 },
    );
  }

  // If a file already exists at the conventional path, treat as already attached
  const path = voucherPhotoObjectPath(gate.user.id, id);
  const { data: existing } = await admin.storage.from(VOUCHER_PHOTO_BUCKET).list(
    gate.user.id,
    { search: `${id}.jpg`, limit: 1 },
  );
  if ((existing ?? []).some((f) => f.name === `${id}.jpg`)) {
    return NextResponse.json(
      { error: "Photo already attached; cannot change after create" },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Photo file is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Photo is too large after compression (max 512 KB)" },
      { status: 400 },
    );
  }
  const mime = (file.type || "").toLowerCase();
  if (mime && mime !== "image/jpeg" && mime !== "image/webp") {
    return NextResponse.json(
      { error: "Only compressed JPEG/WebP photos are accepted" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(VOUCHER_PHOTO_BUCKET)
    .upload(path, buffer, {
      contentType: mime || "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  // Best-effort DB pointer when migration 021 is applied
  const { error: updateError } = await admin
    .from("vouchers")
    .update({ photo_path: path })
    .eq("id", id);
  if (updateError && !/photo_path|column|schema cache/i.test(updateError.message)) {
    await admin.storage.from(VOUCHER_PHOTO_BUCKET).remove([path]);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path });
}

/** Signed URL for Boss / authenticated review. */
export async function GET(_request: Request, { params }: Params) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: voucher, error } = await admin
    .from("vouchers")
    .select("id, created_by, photo_path")
    .eq("id", id)
    .maybeSingle();

  let createdBy: string | null = null;
  let photoPath: string | null = null;

  if (!error && voucher) {
    createdBy = voucher.created_by;
    photoPath = (voucher as { photo_path?: string | null }).photo_path ?? null;
  } else {
    const { data: fallback } = await admin
      .from("vouchers")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();
    if (!fallback) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }
    createdBy = fallback.created_by;
  }

  const path = photoPath || (createdBy ? voucherPhotoObjectPath(createdBy, id) : null);
  if (!path) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const { data, error: signError } = await admin.storage
    .from(VOUCHER_PHOTO_BUCKET)
    .createSignedUrl(path, 120);
  if (signError || !data?.signedUrl) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  return NextResponse.json({ url: data.signedUrl, path });
}
