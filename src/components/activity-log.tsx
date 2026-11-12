"use client";

import { formatMoney } from "@/lib/dates";
import type { AuditLog } from "@/lib/types";

function summarize(log: AuditLog): string {
  const after = log.after_data;
  const before = log.before_data;
  if (log.action === "insert" && after) {
    return `Added ${formatMoney(String(after.amount))} — ${String(after.description ?? "")}`;
  }
  if (log.action === "delete" && before) {
    return `Removed ${formatMoney(String(before.amount))} — ${String(before.description ?? "")}`;
  }
  if (log.action === "update" && before && after) {
    const bits: string[] = [];
    if (before.amount !== after.amount) {
      bits.push(`${formatMoney(String(before.amount))} → ${formatMoney(String(after.amount))}`);
    }
    if (before.description !== after.description) {
      bits.push(`desc changed`);
    }
    return bits.join("; ") || "Updated entry";
  }
  return log.action;
}

export function ActivityLog({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
        No changes logged for this day yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" style={{ fontFamily: "var(--font-body)" }}>
      {logs.map((log) => (
        <li
          key={log.id}
          className="rounded-lg border px-3 py-2.5"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm">
              {log.entity_number ?? "—"}{" "}
              <span className="font-normal capitalize" style={{ color: "var(--ink-muted)" }}>
                {log.action} · {log.entity_type}
              </span>
            </strong>
            <time className="text-xs" style={{ color: "var(--ink-muted)" }}>
              {new Date(log.created_at).toLocaleString()}
            </time>
          </div>
          <p className="mt-1 text-sm">{summarize(log)}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            by {log.actor_name ?? "Unknown"}
          </p>
        </li>
      ))}
    </ul>
  );
}
