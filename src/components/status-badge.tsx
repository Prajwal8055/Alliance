import type { DayStatus } from "@/lib/types";

const labels: Record<DayStatus, string> = {
  open: "Open",
  pending_approval: "Waiting for approval",
  approved: "Approved",
};

const styles: Record<DayStatus, { bg: string; color: string }> = {
  open: { bg: "var(--accent-soft)", color: "var(--accent)" },
  pending_approval: { bg: "var(--warn-soft)", color: "var(--warn)" },
  approved: { bg: "var(--locked-soft)", color: "var(--locked)" },
};

export function StatusBadge({ status }: { status: DayStatus }) {
  const s = styles[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
      style={{ background: s.bg, color: s.color, fontFamily: "var(--font-body)" }}
    >
      {labels[status]}
    </span>
  );
}
