"use client";

type Props = {
  title: string;
  body: string;
  eyebrow?: string;
  confirmLabel?: string;
  onDismiss: () => void;
  tone?: "warn" | "info";
};

export function NoticeModal({
  title,
  body,
  eyebrow,
  confirmLabel = "OK",
  onDismiss,
  tone = "info",
}: Props) {
  const accent = tone === "warn" ? "var(--danger)" : "var(--accent)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {eyebrow ? (
          <p
            className="text-xs uppercase tracking-[0.16em]"
            style={{ color: accent, fontFamily: "var(--font-body)" }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 id="notice-title" className="mt-1 text-2xl font-semibold">
          {title}
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}
        >
          {body}
        </p>
        <div className="mt-6" style={{ fontFamily: "var(--font-body)" }}>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-4 py-2.5 font-semibold text-white"
            style={{ background: accent }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
