"use client";

import { useMemo, useState } from "react";
import { amountInWordsInr } from "@/lib/amount-in-words";
import { formatEntryDate } from "@/lib/uk-square-payments";

export type UkSquareAdvanceRow = {
  id: string;
  destination: "d_kantha" | "d_kantha_cash";
  entryDate: string;
  amount: number;
  note: string;
};

type Props = {
  /** Sum of BSP Excess Cash across all sites (before advances). */
  bspTotal: number;
  /** Advances already posted (lessened from BSP). */
  advances: UkSquareAdvanceRow[];
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    destination: "d_kantha" | "d_kantha_cash";
    entryDate: string;
    amount: number;
    remarks: string;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
};

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatInr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function destLabel(d: "d_kantha" | "d_kantha_cash") {
  return d === "d_kantha" ? "Mr. D Kantha (W)" : "D KANTHA Cash";
}

export function UkSquareAdvanceModal({
  bspTotal,
  advances,
  busy,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [destination, setDestination] = useState<"d_kantha" | "d_kantha_cash">(
    "d_kantha",
  );
  const [entryDate, setEntryDate] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const advancesTotal = useMemo(
    () => advances.reduce((s, a) => s + a.amount, 0),
    [advances],
  );
  const bspAvailable = Math.max(0, (bspTotal || 0) - advancesTotal);
  const amountN = parseMoney(amount);
  const amountWords = useMemo(() => {
    if (amountN == null) return null;
    return amountInWordsInr(amountN);
  }, [amountN]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || busy) return;
    if (!entryDate) {
      setError("Date is required.");
      return;
    }
    if (amountN == null) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (amountN > bspAvailable) {
      setError(
        `Amount exceeds total BSP Excess Cash available (${formatInr(bspAvailable)}).`,
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        destination,
        entryDate,
        amount: amountN,
        remarks: remarks.trim(),
      });
      setAmount("");
      setRemarks("");
      setEntryDate(todayIso());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post advance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="uk-square-advance-title"
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
          Boss only
        </p>
        <h2
          id="uk-square-advance-title"
          className="mt-1 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Advance
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}
        >
          Not linked to any site. Choose where the advance goes — the amount is
          taken from total BSP Excess Cash.
        </p>

        <form
          onSubmit={(ev) => void submit(ev)}
          className="mt-5 grid gap-4"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <div>
            <p className="mb-2 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
              Goes to
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["d_kantha", "Mr. D Kantha (W)"],
                  ["d_kantha_cash", "D KANTHA Cash"],
                ] as const
              ).map(([key, label]) => {
                const active = destination === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDestination(key)}
                    className="rounded-xl border px-3 py-3 text-left text-sm font-semibold transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--accent-soft)" : "#fff",
                      color: "var(--ink)",
                      boxShadow: active ? "var(--shadow)" : undefined,
                    }}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Total BSP available
            </p>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatInr(bspAvailable)}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Sheet BSP {formatInr(bspTotal)}
              {advancesTotal > 0
                ? ` − advances ${formatInr(advancesTotal)}`
                : ""}
            </p>
          </div>

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
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.]/g, "");
                  const parts = raw.split(".");
                  const next =
                    parts.length <= 1
                      ? raw
                      : `${parts[0]}.${parts.slice(1).join("")}`;
                  setAmount(next);
                }}
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

          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Remarks
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes"
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm resize-y min-h-[3.5rem]"
              style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
            />
          </label>

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
              {saving ? "Posting…" : "Post advance"}
            </button>
          </div>
        </form>

        <div className="mt-6" style={{ fontFamily: "var(--font-body)" }}>
          <p className="text-sm font-semibold">Advance log</p>
          <div
            className="mt-2 overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--line)" }}
          >
            <table className="min-w-full text-left text-sm">
              <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  {onDelete ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 ? (
                  <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td
                      colSpan={onDelete ? 4 : 3}
                      className="px-3 py-4 text-center text-sm"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      No advances yet.
                    </td>
                  </tr>
                ) : (
                  advances.map((row) => (
                    <tr key={row.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatEntryDate(row.entryDate)}
                      </td>
                      <td className="px-3 py-2">{destLabel(row.destination)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatInr(row.amount)}
                      </td>
                      {onDelete ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busy || saving}
                            onClick={() => void onDelete(row.id)}
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
