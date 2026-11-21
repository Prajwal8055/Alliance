import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VOUCHER_PHOTO_BUCKET } from "@/lib/voucher-photo";

/**
 * Supabase Free plan defaults (override via env):
 * - STORAGE_QUOTA_BYTES — file storage (default 1 GiB)
 * - DATABASE_QUOTA_BYTES — database (default 500 MiB)
 */
const DEFAULT_FILE_QUOTA = 1 * 1024 * 1024 * 1024;
const DEFAULT_DB_QUOTA = 500 * 1024 * 1024;

type UsageRow = {
  used_bytes?: number;
  file_count?: number;
  all_buckets_used_bytes?: number;
  all_buckets_file_count?: number;
  database_bytes?: number;
  total_used_bytes?: number;
};

async function sumBucketViaList(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ usedBytes: number; fileCount: number }> {
  let usedBytes = 0;
  let fileCount = 0;
  const { data: top, error } = await admin.storage
    .from(VOUCHER_PHOTO_BUCKET)
    .list("", { limit: 1000 });
  if (error) throw new Error(error.message);

  for (const entry of top ?? []) {
    if (!entry.name) continue;
    const metaSize =
      entry.metadata && typeof entry.metadata === "object"
        ? Number((entry.metadata as { size?: number }).size ?? 0)
        : 0;
    if (metaSize > 0 && entry.id) {
      usedBytes += metaSize;
      fileCount += 1;
      continue;
    }
    const { data: files, error: listErr } = await admin.storage
      .from(VOUCHER_PHOTO_BUCKET)
      .list(entry.name, { limit: 1000 });
    if (listErr) continue;
    for (const f of files ?? []) {
      if (!f.name) continue;
      const size =
        f.metadata && typeof f.metadata === "object"
          ? Number((f.metadata as { size?: number }).size ?? 0)
          : 0;
      if (size > 0) {
        usedBytes += size;
        fileCount += 1;
      }
    }
  }
  return { usedBytes, fileCount };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const fileQuotaBytes = Number(
    process.env.STORAGE_QUOTA_BYTES || DEFAULT_FILE_QUOTA,
  );
  const databaseQuotaBytes = Number(
    process.env.DATABASE_QUOTA_BYTES || DEFAULT_DB_QUOTA,
  );

  try {
    const { data, error } = await supabase.rpc("get_storage_usage");
    if (!error && data) {
      const row = data as UsageRow;
      const fileUsedBytes = Number(
        row.all_buckets_used_bytes ?? row.used_bytes ?? 0,
      );
      const fileCount = Number(
        row.all_buckets_file_count ?? row.file_count ?? 0,
      );
      const databaseBytes = Number(row.database_bytes ?? 0);
      const usedBytes = Number(row.total_used_bytes ?? databaseBytes + fileUsedBytes);
      const quotaBytes = databaseQuotaBytes + fileQuotaBytes;
      const freeBytes = Math.max(0, quotaBytes - usedBytes);

      return NextResponse.json({
        usedBytes,
        freeBytes,
        quotaBytes,
        fileCount,
        databaseBytes,
        databaseQuotaBytes,
        databaseFreeBytes: Math.max(0, databaseQuotaBytes - databaseBytes),
        fileUsedBytes,
        fileQuotaBytes,
        fileFreeBytes: Math.max(0, fileQuotaBytes - fileUsedBytes),
        label: "Supabase",
      });
    }

    const admin = createAdminClient();
    const { usedBytes: fileUsedBytes, fileCount } = await sumBucketViaList(admin);
    const databaseBytes = 0;
    const usedBytes = fileUsedBytes;
    const quotaBytes = databaseQuotaBytes + fileQuotaBytes;
    return NextResponse.json({
      usedBytes,
      freeBytes: Math.max(0, quotaBytes - usedBytes),
      quotaBytes,
      fileCount,
      databaseBytes,
      databaseQuotaBytes,
      databaseFreeBytes: databaseQuotaBytes,
      fileUsedBytes,
      fileQuotaBytes,
      fileFreeBytes: Math.max(0, fileQuotaBytes - fileUsedBytes),
      label: "Supabase",
      fallback: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read storage usage" },
      { status: 500 },
    );
  }
}
