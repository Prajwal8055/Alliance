"use client";

type Props = {
  title: string;
  imageUrl: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
};

export function VoucherPhotoModal({
  title,
  imageUrl,
  loading = false,
  error = null,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voucher-photo-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow)]"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2
              id="voucher-photo-title"
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
            >
              Bill photo
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            Close
          </button>
        </div>
        <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-[var(--bg-deep)] p-4">
          {loading ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              Loading photo…
            </p>
          ) : error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Bill photo for ${title}`}
              className="max-h-[75vh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              No photo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
