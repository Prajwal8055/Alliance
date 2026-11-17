/** Client-side image compression for voucher bill photos. */

export const VOUCHER_PHOTO_MAX_BYTES = 80 * 1024; // ~80 KB target
export const VOUCHER_PHOTO_MAX_EDGE = 1280;
export const VOUCHER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/jpg",
]);

export type CompressedImage = {
  blob: Blob;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Resize + JPEG-compress a photo for voucher upload.
 * Aims for under ~80 KB while keeping the bill readable.
 */
export async function compressVoucherPhoto(file: File): Promise<CompressedImage> {
  if (!file || file.size === 0) {
    throw new Error("Choose a photo to upload");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Photo is too large (max 12 MB before compression)");
  }
  const type = (file.type || "").toLowerCase();
  if (type && !ALLOWED_TYPES.has(type) && !type.startsWith("image/")) {
    throw new Error("Only image files can be attached");
  }

  const img = await loadImage(file);
  const scale = Math.min(
    1,
    VOUCHER_PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
  );
  let width = Math.max(1, Math.round(img.naturalWidth * scale));
  let height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not supported in this browser");

  let quality = 0.72;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvasToJpeg(canvas, quality);

    if (blob.size <= VOUCHER_PHOTO_MAX_BYTES) break;

    if (quality > 0.42) {
      quality -= 0.08;
    } else {
      width = Math.max(480, Math.round(width * 0.82));
      height = Math.max(480, Math.round(height * 0.82));
      quality = Math.max(0.4, quality);
    }
  }

  if (!blob) throw new Error("Image compression failed");

  return {
    blob,
    mimeType: "image/jpeg",
    width,
    height,
    bytes: blob.size,
  };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
}
