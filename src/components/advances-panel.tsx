"use client";

import { useMemo, useState } from "react";
import { formatDisplayDate, formatMoney } from "@/lib/dates";
import type { Advance, AdvanceStatus } from "@/lib/types";

type Props = {
  rows: Advance[];
  bookDate: string;
  canCreate: boolean;
  isBoss: boolean;
  busy?: boolean;
  onAdd: (input: { person_name: string; amount: number; entry_date: string }) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onRepay: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function statusLabel(status: AdvanceStatus) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Repaid";
}

function statusColor(status: AdvanceStatus) {
  if (status === "pending") return "var(--warn)";
  if (status === "approved") return "var(--accent)";
  return "var(--ink-muted)";
}

export function AdvancesPanel({
  rows,
  bookDate,
  canCreate,
  isBoss,
  busy = false,
  onAdd,
  onApprove,
  onRepay,
  onDelete,
}: Props) {
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalOut = useMemo(
    () =>
      rows
        .filter((r) => r.status === "approved" || r.status === "repaid")
        .reduce((s, r) => s + Number(r.amount), 0),
    [rows],
  );
  const totalPending = useMemo(
    () => rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.amount), 0),
    [rows],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const name = personName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid advance amount");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({ person_name: name, amount: n, entry_date: bookDate });
      setPersonName("");
      setAmount("");
      setFormOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      if (/advances_active_person_unique|duplicate key/i.test(msg)) {
        setError("This person already has an active advance. Name cannot repeat.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ fontFamily: "var(--font-body)" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Advance
          </h2>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Sl.no is automatic. Each person name can have only one active advance. Boss must approve
            each advance — approved amounts leave cash; repay adds them back.
          </p>
        </div>
        {canCreate && !formOpen ? (
          <button
            type="button"
            aria-label="Add advance"
            onClick={() => {
              setFormOpen(true);
              setError(null);
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl font-semibold leading-none text-white"
            style={{ background: "var(--accent)" }}
          >
            +
          </button>
        ) : null}
      </div>

      {formOpen && canCreate ? (
        <form
          onSubmit={submit}
          className="mb-5 grid gap-3 rounded-xl border p-4 md:grid-cols-[1.4fr_0.8fr_auto]"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Name of the person
            <input
              required
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder="Person name"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Advance amount
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving || busy}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <table className="min-w-full text-left text-sm">
          <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
            <tr>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Sl.no</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Name of the person</th>
              <th className="px-3 py-2.5 font-medium text-right">Advance amount</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="w-0 px-2 py-2.5 text-center text-xs font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--ink-muted)" }}>
                  No advances yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{row.sl_no}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {formatDisplayDate(row.entry_date)}
                </td>
                <td className="px-3 py-2.5 font-medium">{row.person_name}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {formatMoney(row.amount)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      color: statusColor(row.status),
                      background: "var(--bg-deep)",
                    }}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="w-0 px-2 py-2.5 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {row.status === "pending" && isBoss ? (
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={async () => {
                          if (!confirm(`Approve advance for ${row.person_name}?`)) return;
                          setSaving(true);
                          setError(null);
                          try {
                            await onApprove(row.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Approve failed");
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: "var(--accent)" }}
                      >
                        Approve
                      </button>
                    ) : null}
                    {row.status === "approved" ? (
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={async () => {
                          if (!confirm(`Mark ${row.person_name}'s advance as repaid? Cash returns to balance.`)) {
                            return;
                          }
                          setSaving(true);
                          setError(null);
                          try {
                            await onRepay(row.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Repay failed");
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-60"
                        style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                      >
                        Repay
                      </button>
                    ) : null}
                    {(isBoss || row.status === "pending") ? (
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={async () => {
                          if (!confirm(`Delete advance for ${row.person_name}?`)) return;
                          setSaving(true);
                          setError(null);
                          try {
                            await onDelete(row.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Delete failed");
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-40"
                        style={{ color: "var(--danger)" }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm" style={{ color: "var(--ink-muted)" }}>
        <p>
          Pending: <span className="font-semibold" style={{ color: "var(--ink)" }}>{formatMoney(totalPending)}</span>
        </p>
        <p>
          Approved / out:{" "}
          <span className="font-semibold" style={{ color: "var(--danger)" }}>{formatMoney(totalOut)}</span>
        </p>
      </div>
    </section>
  );
}
