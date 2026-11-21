"use client";

import { useMemo, useState } from "react";
import type { UkSquareBooking } from "@/lib/uk-square-data";
import {
  categoryMeta,
  formatEntryDate,
  type UkSquarePaymentCategory,
  type UkSquarePaymentEntry,
} from "@/lib/uk-square-payments";

type Props = {
  booking: UkSquareBooking;
  category: UkSquarePaymentCategory;
  entries: UkSquarePaymentEntry[];
  /** Existing site total before dated lines exist (from booking/seed). */
  seedAmount?: number | null;
  canAdd: boolean;
  canDelete: boolean;
  busy?: boolean;
  onClose: () => void;
  onAdd: (input: { entryDate: string; amount: number }) => Promise<void>;
  onDelete: (entry: UkSquarePaymentEntry) => Promise<void>;
  onImportSeed?: () => Promise<void>;
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
  onImportSeed,
}: Props) {
  const meta = categoryMeta(category);
  const [entryDate, setEntryDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showImport =
    canAdd &&
    entries.length === 0 &&
    seedAmount != null &&
    seedAmount > 0 &&
    Boolean(onImportSeed);

  const total = useMemo(
    () => entries.reduce((s, e) => s + e.amount, 0),
    [entries],
  );
  const nextSl = useMemo(
    () => entries.reduce((m, e) => Math.max(m, e.entrySlNo), 0) + 1,
    [entries],
  );

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
      setEntryDate("");
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

        {showImport ? (
          <div
            className="mt-4 rounded-xl border px-3 py-3 text-sm"
            style={{
              borderColor: "var(--line)",
              background: "var(--accent-soft)",
              fontFamily: "var(--font-body)",
            }}
          >
            <p>
              Site total on file:{" "}
              <span className="font-semibold tabular-nums">{formatInr(seedAmount)}</span>
              . Import as Sl 1 (booking DOB), then add later dates — e.g. another payment on
              30.10.2026.
            </p>
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => void onImportSeed?.()}
              className="mt-2 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Import as Sl 1
            </button>
          </div>
        ) : null}

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
              {entries.length === 0 ? (
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td
                    colSpan={canDelete ? 4 : 3}
                    className="px-3 py-6 text-center text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    No entries yet. Add the first payment below.
                  </td>
                </tr>
              ) : (
                entries.map((row) => (
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
                ))
              )}
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
