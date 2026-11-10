// Pure helpers shared by pages and server actions. Covered by lib/format.test.ts.

/** "Vasanth Kumar" -> "vasanth-kumar" (matches the DB slug check). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Accepts "9606025056", "+91 96060 25056", "091-9606025056" etc. and returns
 * digits with country code ("919606025056"), or null if it is not a valid number.
 * Ten-digit numbers are treated as Indian mobiles.
 */
export function normalizeWhatsapp(input: string): string | null {
  let digits = input.replace(/[\s()+-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10) {
    return /^[6-9]/.test(digits) ? `91${digits}` : null;
  }
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}

/** "919606025056" -> "+91 96060 25056" for display. */
export function formatPhone(digits: string): string {
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type ImageExt = 'jpg' | 'png' | 'webp';

/** Identify an image by its magic bytes rather than the client-supplied type. */
export function detectImageType(bytes: Uint8Array): ImageExt | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

export const IMAGE_MIME: Record<ImageExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Read a bounded integer from a form field; null if missing or invalid. */
export function parseCount(value: FormDataEntryValue | null, max = 100000): number | null {
  if (typeof value !== 'string' || !/^\d{1,7}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n <= max ? n : null;
}

export function text(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Only allow same-site relative redirect targets ("/admin"), never "//evil.com". */
export function safeNextPath(value: string | null): string {
  return value && /^\/(?![/\\])/.test(value) ? value : '/admin';
}
