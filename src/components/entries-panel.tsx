"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountdown,
  formatMoney,
  remainingEditMs,
} from "@/lib/dates";
import type { DayStatus } from "@/lib/types";

export type EntryRow = {
  id: string;
  number: string;
  entry_date: string;
  description: string;
  amount: number;
  editable_until: string;
};

type Props = {
  kind: "receipt" | "voucher";
  title: string;
  rows: EntryRow[];
  bookDate: string;
  dayStatus: DayStatus;
  dayOpen: boolean;
  onAdd: (input: { description: string; amount: number; entry_date: string }) => Promise<void>;
  onUpdate: (
    id: string,
    input: { description: string; amount: number; entry_date: string },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function canEditRow(row: EntryRow, dayOpen: boolean, now: number) {
  return dayOpen && remainingEditMs(row.editable_until, now) > 0;
}

export function EntriesPanel({
  kind,
  title,
  rows,
  bookDate,
  dayStatus,
  dayOpen,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(bookDate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!editingId) setEntryDate(bookDate);
  }, [bookDate, editingId]);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.amount), 0),
    [rows],
  );

  const canCreate = dayOpen && dayStatus === "open";

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        description: description.trim(),
        amount: Number(amount),
        entry_date: entryDate,
      });
      setDescription("");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(editingId, {
        description: description.trim(),
        amount: Number(amount),
        entry_date: entryDate,
      });
      setEditingId(null);
      setDescription("");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: EntryRow) {
    setEditingId(row.id);
    setDescription(row.description);
    setAmount(String(row.amount));
    setEntryDate(row.entry_date);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDescription("");
    setAmount("");
    setError(null);
  }

  return (
    <section style={{ fontFamily: "var(--font-body)" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h2>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Numbers auto-generate and never repeat. Edit window: 10 minutes after create.
          </p>
        </div>
        <p className="text-lg font-semibold">
          Total {formatMoney(total)}
        </p>
      </div>

      {canCreate || editingId ? (
        <form
          onSubmit={editingId ? submitEdit : submitAdd}
          className="mb-5 grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1.4fr_0.8fr_auto]"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Date
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Description
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder={kind === "receipt" ? "Cash received from…" : "Paid to…"}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Amount
            <input
              required
              type="number"
              min="0"
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
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {editingId ? "Save" : "Add"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mb-4 text-sm" style={{ color: "var(--ink-muted)" }}>
          {dayStatus === "approved"
            ? "This day is approved and locked."
            : dayStatus === "pending_approval"
              ? "Waiting for Boss approval — editing closed."
              : "Editing is closed for this day."}
        </p>
      )}

      {error ? (
        <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <table className="min-w-full text-left text-sm">
          <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
            <tr>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">
                {kind === "receipt" ? "Receipt #" : "Voucher #"}
              </th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">Edit window</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--ink-muted)" }}>
                  No entries yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const editable = canEditRow(row, dayOpen, now);
                const left = remainingEditMs(row.editable_until, now);
                return (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.entry_date}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.number}</td>
                    <td className="px-3 py-2.5">{row.description}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {editable ? (
                        <span style={{ color: "var(--warn)" }}>{formatCountdown(left)} left</span>
                      ) : (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: "var(--locked-soft)", color: "var(--locked)" }}
                        >
                          Locked
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {editable ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-sm font-semibold underline"
                            style={{ color: "var(--accent)" }}
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm font-semibold underline"
                            style={{ color: "var(--danger)" }}
                            onClick={async () => {
                              if (!confirm(`Delete ${row.number}?`)) return;
                              setBusy(true);
                              try {
                                await onDelete(row.id);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Delete failed");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--ink-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
