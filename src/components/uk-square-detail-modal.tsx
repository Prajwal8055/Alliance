"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UkSquarePaymentModal } from "@/components/uk-square-payment-modal";
import { createClient } from "@/lib/supabase/client";
import type { UkSquareBooking } from "@/lib/uk-square-data";
import {
  UK_SQUARE_PAYMENT_CATEGORIES,
  dobToIsoDate,
  type UkSquarePaymentCategory,
  type UkSquarePaymentEntry,
} from "@/lib/uk-square-payments";

type Props = {
  booking: UkSquareBooking;
  canAdd?: boolean;
  canDelete?: boolean;
  onClose: () => void;
  /** Called after payment totals change so the list can refresh. */
  onPaymentsChanged?: () => void | Promise<void>;
};

type DbPay = {
  id: string;
  booking_sl_no: number;
  site_no: string;
  category: UkSquarePaymentCategory;
  entry_sl_no: number;
  entry_date: string;
  amount: number;
  note: string;
};

function formatInr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function seedAmount(
  booking: Pick<UkSquareBooking, "toAsBooking" | "others" | "mrDKantha" | "dKantha" | "bsp">,
  key: UkSquarePaymentCategory,
): number | null {
  if (key === "as_booking") return booking.toAsBooking;
  if (key === "total_cash") return booking.others;
  if (key === "d_kantha") return booking.mrDKantha ?? booking.dKantha;
  return booking.bsp;
}

function dbToEntry(row: DbPay): UkSquarePaymentEntry {
  return {
    id: row.id,
    bookingSlNo: row.booking_sl_no,
    siteNo: row.site_no ?? "",
    category: row.category,
    entrySlNo: row.entry_sl_no,
    entryDate: row.entry_date,
    amount: Number(row.amount),
    note: row.note ?? "",
  };
}

export function UkSquareDetailModal({
  booking,
  canAdd = false,
  canDelete = false,
  onClose,
  onPaymentsChanged,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<UkSquarePaymentEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<UkSquarePaymentCategory | null>(null);
  /** Avoid double-inserting seed when React Strict Mode remounts. */
  const seedingRef = useRef<string | null>(null);
  /** Freeze original site amounts so opening one head doesn't blank the others. */
  const seedSnapshot = useMemo(
    () => ({
      toAsBooking: booking.toAsBooking,
      others: booking.others,
      mrDKantha: booking.mrDKantha,
      dKantha: booking.dKantha,
      bsp: booking.bsp,
    }),
    // Capture once per site open — not on every payment refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.slNo, booking.siteNo],
  );

  const loadEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("uk_square_payment_entries")
      .select("id, booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note")
      .eq("booking_sl_no", booking.slNo)
      .order("entry_sl_no", { ascending: true });
    if (error) {
      setLoadError(error.message);
      setEntries([]);
      return;
    }
    setLoadError(null);
    setEntries(((data ?? []) as DbPay[]).map(dbToEntry));
  }, [booking.slNo, supabase]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const sums = useMemo(() => {
    const out: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      bsp: 0,
    };
    const counts: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      bsp: 0,
    };
    for (const e of entries) {
      out[e.category] += e.amount;
      counts[e.category] += 1;
    }
    return { out, counts };
  }, [entries]);

  function displayAmount(key: UkSquarePaymentCategory): number | null {
    if (sums.counts[key] > 0) return sums.out[key] || null;
    return seedAmount(seedSnapshot, key) ?? seedAmount(booking, key);
  }

  const cash = displayAmount("total_cash");
  const kantha = displayAmount("d_kantha");
  const totalReceived =
    (cash ?? 0) + (kantha ?? 0) || null;

  const activeEntries = useMemo(
    () =>
      activeCategory
        ? entries
            .filter((e) => e.category === activeCategory)
            .sort((a, b) => a.entrySlNo - b.entrySlNo)
        : [],
    [activeCategory, entries],
  );

  async function syncBookingTotals() {
    await supabase.rpc("sync_uk_square_booking_totals", {
      p_booking_sl_no: booking.slNo,
    });
  }

  /** Persist booking seed as Sl 1 · DOB when no dated lines exist yet. */
  useEffect(() => {
    if (!activeCategory || !canAdd) return;
    if (busy) return;
    const key = `${booking.slNo}:${activeCategory}`;
    if (seedingRef.current === key) return;
    const catEntries = entries.filter((e) => e.category === activeCategory);
    if (catEntries.length > 0) {
      seedingRef.current = key;
      return;
    }
    const seed =
      seedAmount(seedSnapshot, activeCategory) ??
      seedAmount(booking, activeCategory);
    if (seed == null || seed <= 0) return;

    const iso =
      dobToIsoDate(booking.dob) || new Date().toISOString().slice(0, 10);
    seedingRef.current = key;
    let cancelled = false;

    void (async () => {
      setBusy(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("uk_square_payment_entries").insert({
          booking_sl_no: booking.slNo,
          site_no: booking.siteNo,
          category: activeCategory,
          entry_sl_no: 1,
          entry_date: iso,
          amount: seed,
          created_by: user?.id ?? null,
        });
        if (error) throw new Error(error.message);
        if (cancelled) return;
        await syncBookingTotals();
        await loadEntries();
        await onPaymentsChanged?.();
      } catch {
        seedingRef.current = null;
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Seed once per open category when that head still has no dated rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-once seed
  }, [activeCategory, canAdd, entries, booking.slNo]);

  useEffect(() => {
    if (!activeCategory) seedingRef.current = null;
  }, [activeCategory]);

  async function handleAdd(input: { entryDate: string; amount: number }) {
    if (!activeCategory) return;
    setBusy(true);
    try {
      const nextSl =
        activeEntries.reduce((m, e) => Math.max(m, e.entrySlNo), 0) + 1;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("uk_square_payment_entries").insert({
        booking_sl_no: booking.slNo,
        site_no: booking.siteNo,
        category: activeCategory,
        entry_sl_no: nextSl,
        entry_date: input.entryDate,
        amount: input.amount,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      await syncBookingTotals();
      await loadEntries();
      await onPaymentsChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: UkSquarePaymentEntry) {
    if (!canDelete || busy) return;
    if (
      !window.confirm(
        `Delete Sl ${entry.entrySlNo} · ${formatInr(entry.amount)}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("uk_square_payment_entries")
        .delete()
        .eq("id", entry.id);
      if (error) throw new Error(error.message);
      await syncBookingTotals();
      await loadEntries();
      await onPaymentsChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" style={{ fontFamily: "var(--font-body)" }}>
      <div>
        <button
          type="button"
          onClick={onClose}
          className="mb-2 text-sm font-semibold"
          style={{ color: "var(--accent)" }}
        >
          ← Back to UK Square
        </button>
        <p
          className="text-xs uppercase tracking-[0.16em]"
          style={{ color: "var(--accent)" }}
        >
          Site {booking.siteNo || "—"}
        </p>
        <h2
          id="uk-square-detail-title"
          className="mt-1 text-3xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          {booking.clientName}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
          Sl {booking.slNo}
          {booking.dob ? ` · DOB ${booking.dob}` : ""}
          {booking.facing ? ` · ${booking.facing}` : ""}
          {booking.realtors ? ` · ${booking.realtors}` : ""}
        </p>
        {booking.remarks?.trim() ? (
          <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: "var(--ink)" }}>
            <span style={{ color: "var(--ink-muted)" }}>Remarks · </span>
            {booking.remarks.trim()}
          </p>
        ) : null}
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          Site details stay fixed. Click an amount to add dated cash / bank entries one at a time.
        </p>
        {loadError ? (
          <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>
            Could not load payment entries: {loadError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Price / sqft
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {booking.price ?? "—"}
          </p>
        </div>
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Sqft
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {booking.sqft ?? "—"}
          </p>
        </div>
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Facing
          </p>
          <p
            className="mt-1 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {booking.facing || "—"}
          </p>
        </div>
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Total received
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {formatInr(totalReceived)}
          </p>
        </div>
      </div>

      <div>
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Cash &amp; bank entries
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
          Tap a row to open Sl · Date · Amount for that head.
        </p>
      </div>

      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
              <tr>
                <th className="px-4 py-3 font-semibold">Entry</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {UK_SQUARE_PAYMENT_CATEGORIES.map((line) => {
                const amount = displayAmount(line.key);
                const count = sums.counts[line.key];
                return (
                  <tr
                    key={line.key}
                    className="border-t cursor-pointer transition hover:bg-[var(--accent-soft)]"
                    style={{ borderColor: "var(--line)" }}
                    onClick={() => setActiveCategory(line.key)}
                    title={`Open ${line.label} entries`}
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-medium">{line.label}</p>
                      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                        {line.note}
                        {count > 0
                          ? ` · ${count} dated entr${count === 1 ? "y" : "ies"}`
                          : " · click to add dated entries"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-right text-base font-semibold tabular-nums whitespace-nowrap">
                      <span style={{ color: "var(--accent)" }}>{formatInr(amount)}</span>
                    </td>
                  </tr>
                );
              })}
              <tr
                className="border-t-2"
                style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
              >
                <td className="px-4 py-3.5 font-semibold">Total received</td>
                <td className="px-4 py-3.5 text-right text-base font-semibold tabular-nums whitespace-nowrap">
                  {formatInr(totalReceived)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {activeCategory ? (
        <UkSquarePaymentModal
          booking={booking}
          category={activeCategory}
          entries={activeEntries}
          seedAmount={
            seedAmount(seedSnapshot, activeCategory) ??
            seedAmount(booking, activeCategory)
          }
          canAdd={canAdd}
          canDelete={canDelete}
          busy={busy}
          onClose={() => setActiveCategory(null)}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />
      ) : null}
    </section>
  );
}
