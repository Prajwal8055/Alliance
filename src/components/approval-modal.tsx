"use client";

import { ActivityLog } from "@/components/activity-log";
import type { AuditLog } from "@/lib/types";

type Props = {
  bookDate: string;
  logs: AuditLog[];
  onApprove: () => void;
  onLater: () => void;
  busy?: boolean;
};

export function ApprovalModal({ bookDate, logs, onApprove, onLater, busy }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p
          className="text-xs uppercase tracking-[0.16em]"
          style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
        >
          Boss approval
        </p>
        <h2 id="approval-title" className="mt-1 text-2xl font-semibold">
          Approve cash book for {bookDate}?
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
          Review today&apos;s changes below. Approving locks the day so Accounts cannot edit.
          Choose Later to keep it waiting for approval.
        </p>

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold" style={{ fontFamily: "var(--font-body)" }}>
            All changes
          </h3>
          <ActivityLog logs={logs} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3" style={{ fontFamily: "var(--font-body)" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="rounded-md px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            Approve & lock
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="rounded-md border px-4 py-2.5 font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--line)", background: "#fff" }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
