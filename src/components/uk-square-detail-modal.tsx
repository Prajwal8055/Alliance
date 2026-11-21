"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UkSquarePaymentModal } from "@/components/uk-square-payment-modal";
import { createClient } from "@/lib/supabase/client";
import type { UkSquareBooking } from "@/lib/uk-square-data";
import {
  UK_SQUARE_PAYMENT_CATEGORIES,
  categoryMeta,
  dobToIsoDate,
  formatEntryDate,
  isAgreementReady,
  isTotalCashUnallocated,
  type UkSquareAgreementStatus,
  type UkSquarePaymentCategory,
  type UkSquarePaymentEntry,
} from "@/lib/uk-square-payments";

type Props = {
  booking: UkSquareBooking & { dbId?: string };
  canAdd?: boolean;
  canDelete?: boolean;
  isBoss?: boolean;
  /** Accounts or Boss may mark agreement when amounts are ready. */
  canMarkAgreement?: boolean;
  agreementStatus?: UkSquareAgreementStatus | null;
  onClose: () => void;
  /** Called after payment totals change so the list can refresh. */
  onPaymentsChanged?: () => void | Promise<void>;
  onApproveBooking?: () => void | Promise<void>;
  onMarkAgreement?: () => void | Promise<void>;
  onApproveAgreement?: () => void | Promise<void>;
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
  status: "pending" | "approved" | null;
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
  if (key === "d_kantha") return booking.mrDKantha;
  if (key === "d_kantha_cash") return booking.dKantha;
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
    status: row.status === "pending" ? "pending" : "approved",
  };
}

export function UkSquareDetailModal({
  booking,
  canAdd = false,
  canDelete = false,
  isBoss = false,
  canMarkAgreement = false,
  agreementStatus = null,
  onClose,
  onPaymentsChanged,
  onApproveBooking,
  onMarkAgreement,
  onApproveAgreement,
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
      .select(
        "id, booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note, status",
      )
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
      d_kantha_cash: 0,
      bsp: 0,
    };
    const allOut: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      d_kantha_cash: 0,
      bsp: 0,
    };
    const counts: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      d_kantha_cash: 0,
      bsp: 0,
    };
    const approvedCounts: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      d_kantha_cash: 0,
      bsp: 0,
    };
    const pendingCounts: Record<UkSquarePaymentCategory, number> = {
      as_booking: 0,
      total_cash: 0,
      d_kantha: 0,
      d_kantha_cash: 0,
      bsp: 0,
    };
    for (const e of entries) {
      counts[e.category] += 1;
      allOut[e.category] += e.amount;
      if (e.status === "pending") {
        pendingCounts[e.category] += 1;
        continue;
      }
      out[e.category] += e.amount;
      approvedCounts[e.category] += 1;
    }
    return { out, allOut, counts, approvedCounts, pendingCounts };
  }, [entries]);

  function headAmount(key: UkSquarePaymentCategory): number | null {
    if (sums.counts[key] > 0) return sums.allOut[key] || null;
    return seedAmount(seedSnapshot, key) ?? seedAmount(booking, key);
  }

  function displayAmount(key: UkSquarePaymentCategory): number | null {
    if (key === "total_cash") {
      const kanthaCash = headAmount("d_kantha_cash") ?? 0;
      const bsp = headAmount("bsp") ?? 0;
      const allocated = (kanthaCash || 0) + (bsp || 0);
      if (allocated > 0) return allocated;
      // Orphaned Total Cash log lines (and seed) so the head matches the entry log.
      if (sums.counts.total_cash > 0) return sums.allOut.total_cash || null;
      return seedAmount(seedSnapshot, "total_cash") ?? seedAmount(booking, "total_cash");
    }
    return headAmount(key);
  }

  const cash = displayAmount("total_cash");
  const kantha = displayAmount("d_kantha");
  const totalReceived =
    (cash ?? 0) + (kantha ?? 0) || null;
  const cashUnallocated = isTotalCashUnallocated(
    cash,
    displayAmount("d_kantha_cash"),
    displayAmount("bsp"),
  );
  const amountsReady = isAgreementReady(cash, kantha);
  const agreementApproved = agreementStatus === "approved";
  const agreementPending = agreementStatus === "pending";
  const showReadyToMark =
    amountsReady && !agreementApproved && !agreementPending;

  const activeEntries = useMemo(
    () =>
      activeCategory
        ? entries
            .filter((e) => e.category === activeCategory)
            .sort((a, b) => a.entrySlNo - b.entrySlNo)
        : [],
    [activeCategory, entries],
  );

  const categoryOrder = useMemo(() => {
    const map = new Map(
      UK_SQUARE_PAYMENT_CATEGORIES.map((c, i) => [c.key, i] as const),
    );
    return map;
  }, []);

  /** Full ledger of every dated payment line on this site. */
  const entryLogs = useMemo(() => {
    return [...entries].sort((a, b) => {
      const d = a.entryDate.localeCompare(b.entryDate);
      if (d !== 0) return d;
      const ca = categoryOrder.get(a.category) ?? 99;
      const cb = categoryOrder.get(b.category) ?? 99;
      if (ca !== cb) return ca - cb;
      return a.entrySlNo - b.entrySlNo;
    });
  }, [entries, categoryOrder]);

  async function syncBookingTotals() {
    await supabase.rpc("sync_uk_square_booking_totals", {
      p_booking_sl_no: booking.slNo,
    });
  }

  /** Persist booking seed as Sl 1 · DOB when no dated lines exist yet. */
  useEffect(() => {
    if (!activeCategory || !canAdd) return;
    if (activeCategory === "total_cash") return;
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
        const { error } = await supabase.rpc("ensure_uk_square_seed_payment", {
          p_booking_sl_no: booking.slNo,
          p_site_no: booking.siteNo,
          p_category: activeCategory,
          p_entry_date: iso,
          p_amount: seed,
        });
        if (error) throw new Error(error.message);
        if (cancelled) return;
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

  async function handleAdd(input: {
    entryDate: string;
    amount: number;
    remarks: string;
  }) {
    if (!activeCategory || activeCategory === "total_cash") return;
    setBusy(true);
    try {
      const nextSl =
        activeEntries.reduce((m, e) => Math.max(m, e.entrySlNo), 0) + 1;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const status = isBoss ? "approved" : "pending";
      const { error } = await supabase.from("uk_square_payment_entries").insert({
        booking_sl_no: booking.slNo,
        site_no: booking.siteNo,
        category: activeCategory,
        entry_sl_no: nextSl,
        entry_date: input.entryDate,
        amount: input.amount,
        note: input.remarks,
        status,
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

  async function handleApprovePayment(entry: UkSquarePaymentEntry) {
    if (!isBoss || busy || entry.status !== "pending") return;
    if (
      !window.confirm(
        `Approve payment Sl ${entry.entrySlNo} · ${formatInr(entry.amount)}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("approve_uk_square_payment_entry", {
        p_id: entry.id,
      });
      if (error) throw new Error(error.message);
      await loadEntries();
      await onPaymentsChanged?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not approve payment.");
    } finally {
      setBusy(false);
    }
  }

  const bookingPending = booking.status === "pending";

  return (
    <section className="space-y-5" style={{ fontFamily: "var(--font-body)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
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
          {bookingPending ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ color: "var(--warn)", background: "var(--bg-deep)" }}
              >
                Pending Boss approval
              </span>
              {isBoss && onApproveBooking ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onApproveBooking()}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  Approve booking
                </button>
              ) : null}
            </div>
          ) : null}
          {booking.remarks?.trim() ? (
            <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: "var(--ink)" }}>
              <span style={{ color: "var(--ink-muted)" }}>Remarks · </span>
              {booking.remarks.trim()}
            </p>
          ) : null}
          <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
            Site details stay fixed. Click an amount to view dated cash / bank entries.
            {isBoss
              ? " You can add or delete payment lines."
              : " Only Boss can edit the entry log."}
          </p>
          {loadError ? (
            <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>
              Could not load payment entries: {loadError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {agreementApproved ? (
            <div
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                color: "var(--accent)",
                background: "var(--accent-soft)",
                border: "1px solid var(--accent)",
              }}
            >
              Agreement done
            </div>
          ) : null}
          {agreementPending ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: "var(--warn)",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--warn)",
                }}
              >
                Agreement pending
              </div>
              {isBoss && onApproveAgreement ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onApproveAgreement()}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  Approve agreement
                </button>
              ) : null}
            </div>
          ) : null}
          {showReadyToMark ? (
            canMarkAgreement && onMarkAgreement ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onMarkAgreement()}
                className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{
                  color: "var(--ink)",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--line)",
                }}
                title="Mark agreement — Boss must approve before it counts as done"
              >
                Ready for agreement · Mark
              </button>
            ) : (
              <div
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: "var(--ink-muted)",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--line)",
                }}
              >
                Ready for agreement
              </div>
            )
          ) : null}
        </div>
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
          Tap a row to open Sl · Date · Amount for that head. Total Cash is D KANTHA Cash + BSP.
          {!isBoss ? " Viewing only — Boss edits the log." : ""}
        </p>
        {cashUnallocated ? (
          <p className="mt-2 text-sm font-medium" style={{ color: "var(--danger)" }} role="alert">
            Total Cash is not fully in D KANTHA Cash or BSP Excess Cash. Move cash into one or both.
          </p>
        ) : null}
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
                const pending = sums.pendingCounts[line.key];
                const derived = Boolean(line.derived);
                return (
                  <tr
                    key={line.key}
                    className={
                      derived
                        ? "border-t"
                        : "border-t cursor-pointer transition hover:bg-[var(--accent-soft)]"
                    }
                    style={{ borderColor: "var(--line)" }}
                    onClick={derived ? undefined : () => setActiveCategory(line.key)}
                    title={
                      derived
                        ? "Total Cash = D KANTHA Cash + BSP"
                        : `Open ${line.label} entries`
                    }
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-medium">{line.label}</p>
                      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                        {line.note}
                        {derived
                          ? ""
                          : count > 0
                            ? ` · ${count} dated entr${count === 1 ? "y" : "ies"}`
                            : " · click to add dated entries"}
                        {!derived && pending > 0 ? ` · ${pending} pending` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-right text-base font-semibold tabular-nums whitespace-nowrap">
                      <span
                        style={{
                          color: derived && cashUnallocated ? "var(--danger)" : "var(--accent)",
                        }}
                      >
                        {formatInr(amount)}
                      </span>
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

      <div>
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Entry log
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
          Every dated payment on this site, oldest first. Tap a row to open that head.
          {isBoss ? "" : " Only Boss can add or delete lines."}
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
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Date</th>
                <th className="px-4 py-3 font-semibold">Head</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Sl</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entryLogs.length === 0 ? (
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    No dated entries yet. Open a head above to add the first log.
                  </td>
                </tr>
              ) : (
                entryLogs.map((row) => {
                  const meta = categoryMeta(row.category);
                  return (
                    <tr
                      key={row.id}
                      className={
                        row.category === "total_cash"
                          ? "border-t"
                          : "border-t cursor-pointer transition hover:bg-[var(--accent-soft)]"
                      }
                      style={{ borderColor: "var(--line)" }}
                      onClick={() => {
                        if (row.category === "total_cash") return;
                        setActiveCategory(row.category);
                      }}
                      title={
                        row.category === "total_cash"
                          ? "Total Cash is derived — post under D KANTHA Cash or BSP"
                          : `Open ${meta.label}`
                      }
                    >
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatEntryDate(row.entryDate)}
                      </td>
                      <td className="px-4 py-3 font-medium">{meta.label}</td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {row.entrySlNo}
                      </td>
                      <td className="px-4 py-3 max-w-[16rem] whitespace-pre-wrap">
                        {row.note?.trim() || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.status === "pending" ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ color: "var(--warn)", background: "var(--bg-deep)" }}
                          >
                            Pending
                          </span>
                        ) : (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ color: "var(--accent)", background: "var(--bg-deep)" }}
                          >
                            Approved
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatInr(row.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
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
          isBoss={isBoss}
          busy={busy}
          onClose={() => setActiveCategory(null)}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onApprove={handleApprovePayment}
        />
      ) : null}
    </section>
  );
}
