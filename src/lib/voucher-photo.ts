import { compressVoucherPhoto } from "@/lib/compress-image";

export const VOUCHER_PHOTO_BUCKET = "voucher-photos";

export function voucherPhotoObjectPath(userId: string, voucherId: string) {
  return `${userId}/${voucherId}.jpg`;
}

/** Compress locally, then upload via authenticated API (create-time only). */
export async function uploadVoucherPhoto(options: {
  voucherId: string;
  file: File;
}): Promise<string> {
  const compressed = await compressVoucherPhoto(options.file);
  const form = new FormData();
  form.append(
    "photo",
    new File([compressed.blob], "bill.jpg", { type: compressed.mimeType }),
  );

  const res = await fetch(`/api/vouchers/${options.voucherId}/photo`, {
    method: "POST",
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    path?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || "Failed to upload photo");
  }
  return body.path || "";
}

export async function getVoucherPhotoSignedUrl(voucherId: string) {
  const res = await fetch(`/api/vouchers/${voucherId}/photo`);
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.error || "Could not open photo");
  }
  return body.url;
}

export async function fetchVoucherPhotoFlags(
  items: { id: string; created_by: string }[],
): Promise<Record<string, true>> {
  if (items.length === 0) return {};
  const res = await fetch("/api/vouchers/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    photos?: Record<string, true>;
    error?: string;
  };
  if (!res.ok) return {};
  return body.photos ?? {};
}

export async function removeVoucherPhoto(photoPath: string | null | undefined) {
  // Deletion is handled alongside voucher delete when path is known;
  // storage cleanup for convention paths is best-effort via wipe / delete API later.
  void photoPath;
}
