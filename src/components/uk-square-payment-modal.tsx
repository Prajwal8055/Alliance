"use client";

import { useMemo, useState } from "react";
import { amountInWordsInr } from "@/lib/amount-in-words";
import type { UkSquareBooking } from "@/lib/uk-square-data";
import {
  categoryMeta,
  dobToIsoDate,
  formatEntryDate,
  type UkSquarePaymentCategory,
  type UkSquarePaymentEntry,
} from "@/lib/uk-square-payments";

type Props = {
  booking: UkSquareBooking;
  category: UkSquarePaymentCategory;
  entries: UkSquarePaymentEntry[];
  /** Booking amount shown as Sl 1 · DOB until dated lines exist. */
  seedAmount?: number | null;
  canAdd: boolean;
  canDelete: boolean;
  busy?: boolean;
  onClose: () => void;
  onAdd: (input: { entryDate: string; amount: number }) => Promise<void>;
  onDelete: (entry: UkSquarePaymentEntry) => Promise<void>;
};

function formatInr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function UkSquarePaymentModal({
  booking,
  category,
  entries,
  seedAmount = null,
  canAdd,
  canDelete,
  busy,
  onClose,
  onAdd,
  onDelete,
}: Props) {
  const meta = categoryMeta(category);
  const [entryDate, setEntryDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const seedRow = useMemo(() => {
    if (entries.length > 0) return null;
    if (seedAmount == null || seedAmount <= 0) return null;
    const iso =
      dobToIsoDate(booking.dob) || new Date().toISOString().slice(0, 10);
    return { entrySlNo: 1, entryDate: iso, amount: seedAmount };
  }, [entries.length, seedAmount, booking.dob]);

  const total = useMemo(() => {
    if (entries.length > 0) {
      return entries.reduce((s, e) => s + e.amount, 0);
    }
    return seedRow?.amount ?? 0;
  }, [entries, seedRow]);
  const nextSl = useMemo(
    () =>
      entries.length > 0
        ? entries.reduce((m, e) => Math.max(m, e.entrySlNo), 0) + 1
        : seedRow
          ? 2
          : 1,
    [entries, seedRow],
  );
  const amountWords = useMemo(() => {
    const n = parseMoney(amount);
    if (n == null || n <= 0) return null;
    return amountInWordsInr(n);
  }, [amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd || saving || busy) return;
    if (!entryDate) {
      setError("Date is required.");
      return;
    }
    const n = parseMoney(amount);
    if (n == null || n <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onAdd({ entryDate, amount: n });
      setAmount("");
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setEntryDate(`${y}-${m}-${d}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="uk-square-pay-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <p
          className="text-xs uppercase tracking-[0.16em]"
          style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
        >
          Site {booking.siteNo || "—"} · {booking.clientName}
        </p>
        <h2
          id="uk-square-pay-title"
          className="mt-1 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {meta.label}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
          {meta.note}. Add one dated amount at a time.
        </p>

        <div
          className="mt-4 overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="min-w-full text-left text-sm" style={{ fontFamily: "var(--font-body)" }}>
            <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
              <tr>
                <th className="px-3 py-2 font-semibold">Sl</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                {canDelete ? <th className="px-3 py-2 font-semibold"> </th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && !seedRow ? (
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td
                    colSpan={canDelete ? 4 : 3}
                    className="px-3 py-6 text-center text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    No entries yet. Add the first payment below.
                  </td>
                </tr>
              ) : null}
              {seedRow ? (
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2.5 tabular-nums">{seedRow.entrySlNo}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatEntryDate(seedRow.entryDate)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(seedRow.amount)}
                  </td>
                  {canDelete ? <td className="px-3 py-2.5" /> : null}
                </tr>
              ) : null}
              {entries.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2.5 tabular-nums">{row.entrySlNo}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatEntryDate(row.entryDate)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(row.amount)}
                  </td>
                  {canDelete ? (
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy || saving}
                        onClick={() => void onDelete(row)}
                        className="text-xs font-semibold disabled:opacity-50"
                        style={{ color: "var(--danger)" }}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr
                className="border-t-2"
                style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
              >
                <td className="px-3 py-2.5 font-semibold" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                  {formatInr(total || null)}
                </td>
                {canDelete ? <td /> : null}
              </tr>
            </tbody>
          </table>
        </div>

        {canAdd ? (
          <form
            onSubmit={(ev) => void submit(ev)}
            className="mt-5 grid gap-3"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <p className="text-sm font-semibold">
              Add entry · Sl {nextSl}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Date
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Amount
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50000"
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                />
                {amountWords ? (
                  <span className="text-[11px] leading-snug" style={{ color: "var(--ink-muted)" }}>
                    {amountWords}
                  </span>
                ) : null}
              </label>
            </div>
            {error ? (
              <p className="text-sm font-medium" style={{ color: "var(--danger)" }} role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border px-4 py-2.5 font-semibold"
                style={{ borderColor: "var(--line)", background: "#fff" }}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={busy || saving}
                className="rounded-md px-4 py-2.5 font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                {saving ? "Saving…" : "Add entry"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5" style={{ fontFamily: "var(--font-body)" }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2.5 font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
