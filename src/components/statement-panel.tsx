"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDisplayDate, formatMoney, shiftBookDate } from "@/lib/dates";
import type { Advance, DayStatus, Receipt, Voucher } from "@/lib/types";

type Props = {
  bookDate: string;
  dayStatus: DayStatus;
  openingBalance: number;
  receipts: Receipt[];
  vouchers: Voucher[];
  advances: Advance[];
  /** Longer history for weekly/monthly cash-flow chart. Defaults to day series. */
  chartReceipts?: Receipt[];
  chartVouchers?: Voucher[];
  chartAdvances?: Advance[];
  rangeFrom: string;
  rangeTo: string;
  rangeActive: boolean;
  dayActionBusy?: boolean;
  showApprove?: boolean;
  showUnlock?: boolean;
  canExport?: boolean;
  /** When false, entry date is locked to the book date (non-Boss). */
  canChangeEntryDate?: boolean;
  onApproveDay?: () => void;
  onUnlockDay?: () => void;
  onRangeFromChange: (date: string) => void;
  onRangeToChange: (date: string) => void;
  onApplyRange: () => void;
  onClearRange: () => void;
  onUpdateOpeningBalance: (amount: number) => Promise<void>;
  onAddReceipt: (input: {
    description: string;
    remarks: string;
    amount: number;
    entry_date: string;
  }) => Promise<void>;
  onAddVoucher: (input: {
    description: string;
    remarks: string;
    amount: number;
    entry_date: string;
  }) => Promise<void>;
  onUpdateReceipt: (
    id: string,
    input: { description: string; remarks: string; amount: number; entry_date: string },
  ) => Promise<void>;
  onUpdateVoucher: (
    id: string,
    input: { description: string; remarks: string; amount: number; entry_date: string },
  ) => Promise<void>;
  onDeleteReceipt: (id: string) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
};

type Line =
  | { key: string; kind: "receipt"; sort: string; entry: Receipt }
  | { key: string; kind: "voucher"; sort: string; entry: Voucher }
  | { key: string; kind: "advance"; sort: string; entry: Advance }
  | { key: string; kind: "advance_repay"; sort: string; entry: Advance };

type ChartMode = "daily" | "weekly" | "monthly";
type TxFilter = "all" | "receipts" | "vouchers" | "advances";

function formatRowDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return formatDisplayDate(date);
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

function weekKey(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function formatMonthLabel(ym: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${m[2]}-${m[1].slice(2)}`;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = shiftBookDate(cur, 1);
  }
  return days;
}

function eachWeekStart(from: string, to: string) {
  const starts: string[] = [];
  let cur = weekKey(from);
  const end = weekKey(to);
  while (cur <= end) {
    starts.push(cur);
    cur = shiftBookDate(cur, 7);
  }
  return starts;
}

function eachMonth(from: string, to: string) {
  const months: string[] = [];
  let cur = monthKey(from);
  const end = monthKey(to);
  while (cur <= end) {
    months.push(cur);
    const [y, m] = cur.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    cur = next;
  }
  return months;
}

export function StatementPanel({
  bookDate,
  dayStatus,
  openingBalance,
  receipts,
  vouchers,
  advances,
  chartReceipts,
  chartVouchers,
  chartAdvances,
  rangeFrom,
  rangeTo,
  rangeActive,
  dayActionBusy,
  showApprove,
  showUnlock,
  canExport = false,
  canChangeEntryDate = false,
  onApproveDay,
  onUnlockDay,
  onRangeFromChange,
  onRangeToChange,
  onApplyRange,
  onClearRange,
  onUpdateOpeningBalance,
  onAddReceipt,
  onAddVoucher,
  onUpdateReceipt,
  onUpdateVoucher,
  onDeleteReceipt,
  onDeleteVoucher,
}: Props) {
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [openingEditOpen, setOpeningEditOpen] = useState(false);
  const [openingDraft, setOpeningDraft] = useState(String(openingBalance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("daily");
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [hoverBar, setHoverBar] = useState<{
    label: string;
    credit: number;
    debit: number;
    x: number;
    y: number;
  } | null>(null);

  const [addKind, setAddKind] = useState<"receipt" | "voucher">("receipt");
  const [entryDate, setEntryDate] = useState(bookDate);
  const [description, setDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<{ kind: "receipt" | "voucher"; id: string } | null>(null);
  const [unlockHoldMs, setUnlockHoldMs] = useState(0);
  const [unlockDone, setUnlockDone] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const unlockHoldRef = useRef<{ start: number; raf: number } | null>(null);
  const UNLOCK_HOLD_MS = 3000;

  useEffect(() => {
    setOpeningDraft(String(openingBalance));
  }, [openingBalance]);

  useEffect(() => {
    if (!editing) setEntryDate(bookDate);
  }, [bookDate, editing]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    return () => {
      if (unlockHoldRef.current) cancelAnimationFrame(unlockHoldRef.current.raf);
    };
  }, []);

  useEffect(() => {
    if (!showUnlock) {
      setUnlockDone(false);
      setUnlockHoldMs(0);
    }
  }, [showUnlock]);

  function stopUnlockHold(reset = true) {
    if (unlockHoldRef.current) {
      cancelAnimationFrame(unlockHoldRef.current.raf);
      unlockHoldRef.current = null;
    }
    if (reset && !unlockDone) setUnlockHoldMs(0);
  }

  function startUnlockHold() {
    if (dayActionBusy || unlockDone || !onUnlockDay) return;
    stopUnlockHold(false);
    const start = performance.now();
    unlockHoldRef.current = { start, raf: 0 };
    const tick = (now: number) => {
      const elapsed = now - start;
      setUnlockHoldMs(Math.min(elapsed, UNLOCK_HOLD_MS));
      if (elapsed >= UNLOCK_HOLD_MS) {
        unlockHoldRef.current = null;
        setUnlockDone(true);
        setUnlockHoldMs(UNLOCK_HOLD_MS);
        onUnlockDay();
        return;
      }
      if (unlockHoldRef.current) {
        unlockHoldRef.current.raf = requestAnimationFrame(tick);
      }
    };
    unlockHoldRef.current.raf = requestAnimationFrame(tick);
  }

  const cashAdvances = useMemo(
    () => advances.filter((a) => a.status === "approved" || a.status === "repaid"),
    [advances],
  );

  const lines = useMemo(() => {
    const list: Line[] = [
      ...receipts.map((entry) => ({
        key: `r-${entry.id}`,
        kind: "receipt" as const,
        sort: `${entry.entry_date}T${entry.created_at}`,
        entry,
      })),
      ...vouchers.map((entry) => ({
        key: `v-${entry.id}`,
        kind: "voucher" as const,
        sort: `${entry.entry_date}T${entry.created_at}`,
        entry,
      })),
      // All advances (pending + approved + repaid) so nothing is hidden.
      ...advances.map((entry) => ({
        key: `a-${entry.id}`,
        kind: "advance" as const,
        sort: `${entry.book_date}T${entry.created_at}`,
        entry,
      })),
      ...cashAdvances
        .filter(
          (a) =>
            a.status === "repaid" &&
            a.repaid_date &&
            !a.repaid_via_receipt &&
            (rangeActive || a.repaid_date === bookDate),
        )
        .map((entry) => ({
          key: `ar-${entry.id}`,
          kind: "advance_repay" as const,
          sort: `${entry.repaid_date}T${entry.updated_at}`,
          entry,
        })),
    ];
    return list.sort((a, b) => a.sort.localeCompare(b.sort));
  }, [receipts, vouchers, advances, cashAdvances, rangeActive, bookDate]);

  const statementRows = useMemo(() => {
    let balance = Number(openingBalance) || 0;
    return lines.map((line) => {
      const credit =
        line.kind === "receipt" || line.kind === "advance_repay" ? Number(line.entry.amount) : 0;
      const shownDebit =
        line.kind === "voucher" || line.kind === "advance" ? Number(line.entry.amount) : 0;
      // Pending advances are listed but do not leave cash until approved.
      const cashDebit =
        line.kind === "voucher" ||
        (line.kind === "advance" && line.entry.status !== "pending")
          ? Number(line.entry.amount)
          : 0;
      balance += credit - cashDebit;
      return { line, credit, debit: shownDebit, balance };
    });
  }, [lines, openingBalance]);

  const receiptTotal = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const voucherTotal = vouchers.reduce((s, r) => s + Number(r.amount), 0);
  const advanceOutTotal = cashAdvances.reduce((s, a) => s + Number(a.amount), 0);
  const advanceRepaidTotal = cashAdvances
    .filter(
      (a) =>
        a.status === "repaid" &&
        a.repaid_date &&
        !a.repaid_via_receipt &&
        (rangeActive || a.repaid_date === bookDate),
    )
    .reduce((s, a) => s + Number(a.amount), 0);
  const closing =
    (Number(openingBalance) || 0) +
    receiptTotal -
    voucherTotal -
    advanceOutTotal +
    advanceRepaidTotal;
  const opening = Number(openingBalance) || 0;
  const closingDeltaPct =
    opening === 0 ? null : ((closing - opening) / Math.abs(opening)) * 100;

  const cashFlowDaily = useMemo(() => {
    const map = new Map<string, { credit: number; debit: number }>();
    const add = (date: string, credit: number, debit: number) => {
      if (!date) return;
      const cur = map.get(date) ?? { credit: 0, debit: 0 };
      cur.credit += credit;
      cur.debit += debit;
      map.set(date, cur);
    };
    const rRows = chartReceipts ?? receipts;
    const vRows = chartVouchers ?? vouchers;
    const aRows = chartAdvances ?? advances;
    for (const r of rRows) add(r.entry_date || r.book_date, Number(r.amount) || 0, 0);
    for (const v of vRows) add(v.entry_date || v.book_date, 0, Number(v.amount) || 0);
    for (const a of aRows) {
      if (a.status === "approved" || a.status === "repaid") {
        add(a.book_date, 0, Number(a.amount) || 0);
      }
      if (a.status === "repaid" && a.repaid_date && !a.repaid_via_receipt) {
        add(a.repaid_date, Number(a.amount) || 0, 0);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ key: date, label: formatRowDate(date), ...v }));
  }, [chartReceipts, chartVouchers, chartAdvances, receipts, vouchers, advances]);

  const cashFlow = useMemo(() => {
    const bucketKey = (date: string) =>
      chartMode === "daily" ? date : chartMode === "weekly" ? weekKey(date) : monthKey(date);
    const bucketLabel = (key: string) =>
      chartMode === "monthly" ? formatMonthLabel(key) : formatRowDate(key);

    const map = new Map<string, { credit: number; debit: number }>();
    for (const d of cashFlowDaily) {
      const key = bucketKey(d.key);
      const cur = map.get(key) ?? { credit: 0, debit: 0 };
      cur.credit += d.credit;
      cur.debit += d.debit;
      map.set(key, cur);
    }

    const spanTo = rangeActive ? rangeTo : bookDate;
    const dataFrom =
      cashFlowDaily.length > 0
        ? cashFlowDaily.reduce((min, d) => (d.key < min ? d.key : min), cashFlowDaily[0].key)
        : bookDate;
    const defaultLookback =
      chartMode === "daily"
        ? shiftBookDate(bookDate, -13)
        : weekKey(shiftBookDate(bookDate, -28));
    const chartFrom = rangeActive
      ? rangeFrom
      : dataFrom < bookDate
        ? dataFrom
        : defaultLookback;

    const buckets =
      chartMode === "daily"
        ? eachDay(chartFrom, spanTo)
        : chartMode === "weekly"
          ? eachWeekStart(chartFrom, spanTo)
          : eachMonth(chartFrom, spanTo);

    const ensured =
      buckets.length > 0
        ? buckets
        : [bucketKey(bookDate)];

    return ensured.map((key) => {
      const hit = map.get(key);
      return {
        key,
        credit: hit?.credit ?? 0,
        debit: hit?.debit ?? 0,
        label: bucketLabel(key),
      };
    });
  }, [cashFlowDaily, chartMode, rangeActive, rangeFrom, rangeTo, bookDate]);

  const cashFlowMax = Math.max(1, ...cashFlow.map((d) => Math.max(d.credit, d.debit)));

  const receiptCount = statementRows.filter(
    (r) => r.line.kind === "receipt" || r.line.kind === "advance_repay",
  ).length;
  const voucherCount = statementRows.filter((r) => r.line.kind === "voucher").length;
  const advanceCount = statementRows.filter(
    (r) => r.line.kind === "advance" || r.line.kind === "advance_repay",
  ).length;

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return statementRows.filter(({ line }) => {
      if (txFilter === "receipts" && line.kind !== "receipt" && line.kind !== "advance_repay") {
        return false;
      }
      if (txFilter === "vouchers" && line.kind !== "voucher") {
        return false;
      }
      if (txFilter === "advances" && line.kind !== "advance" && line.kind !== "advance_repay") {
        return false;
      }
      if (!q) return true;
      const text =
        line.kind === "advance" || line.kind === "advance_repay"
          ? `${line.entry.person_name} ${line.entry.kind ?? ""}`
          : `${line.entry.description} ${
              line.kind === "receipt"
                ? line.entry.receipt_number
                : line.kind === "voucher"
                  ? line.entry.voucher_number
                  : ""
            }`;
      return text.toLowerCase().includes(q);
    });
  }, [statementRows, tableSearch, txFilter]);

  const editable = !rangeActive;

  function openAddEntry(kind: "receipt" | "voucher" = "receipt") {
    setEditing(null);
    setAddKind(kind);
    setEntryDate(bookDate);
    setDescription("");
    setRemarks("");
    setAmount("");
    setError(null);
    setEntryFormOpen(true);
  }

  function openOpeningEdit() {
    setOpeningDraft(String(openingBalance));
    setError(null);
    setOpeningEditOpen(true);
  }

  async function saveOpening() {
    setBusy(true);
    setError(null);
    try {
      await onUpdateOpeningBalance(Number(openingDraft) || 0);
      setOpeningEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save opening");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(line: Extract<Line, { kind: "receipt" | "voucher" }>) {
    setEditing({ kind: line.kind, id: line.entry.id });
    setAddKind(line.kind);
    setEntryDate(line.entry.entry_date);
    setDescription(line.entry.description);
    setRemarks(line.entry.remarks ?? "");
    setAmount(String(line.entry.amount));
    setError(null);
    setEntryFormOpen(true);
  }

  function cancelForm() {
    setEditing(null);
    setDescription("");
    setRemarks("");
    setAmount("");
    setEntryDate(bookDate);
    setError(null);
    setEntryFormOpen(false);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    setBusy(true);
    setError(null);
    const payload = {
      description: description.trim(),
      remarks: remarks.trim(),
      amount: Number(amount),
      entry_date: canChangeEntryDate ? entryDate || bookDate : bookDate,
    };
    try {
      if (editing) {
        if (editing.kind === "receipt") await onUpdateReceipt(editing.id, payload);
        else await onUpdateVoucher(editing.id, payload);
      } else if (addKind === "receipt") {
        await onAddReceipt(payload);
      } else {
        await onAddVoucher(payload);
      }
      cancelForm();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Save failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Date", "Particulars", "Receipt #", "Payment #", "Receipts (Cr)", "Payments (Dr)", "Balance"],
      [
        formatRowDate(bookDate),
        "Opening balance",
        "",
        "",
        "",
        "",
        String(opening),
      ],
      ...filteredRows.map(({ line, credit, debit, balance }) => {
        const rowDate =
          line.kind === "advance_repay"
            ? line.entry.repaid_date || line.entry.book_date
            : line.kind === "advance"
              ? line.entry.book_date
              : line.entry.entry_date;
        const particulars =
          line.kind === "advance"
            ? `${(line.entry.kind ?? "salary") === "commission" ? "Commission" : "Salary"} advance — ${line.entry.person_name}`
            : line.kind === "advance_repay"
              ? `Advance repaid — ${line.entry.person_name}`
              : line.entry.description;
        return [
          formatRowDate(rowDate),
          particulars,
          line.kind === "receipt" ? line.entry.receipt_number : "",
          line.kind === "voucher" ? line.entry.voucher_number : "",
          credit ? String(credit) : "",
          debit ? String(debit) : "",
          String(balance),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-book-${bookDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-muted)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => onRangeFromChange(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
          />
          <span>—</span>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => onRangeToChange(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
          />
        </label>
        <button
          type="button"
          onClick={onApplyRange}
          className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Apply
        </button>
        {rangeActive ? (
          <button
            type="button"
            onClick={onClearRange}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            Clear
          </button>
        ) : null}
        {editable ? (
          <div ref={addMenuRef} className="relative ml-auto flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || dayActionBusy}
              onClick={() => setAddMenuOpen((o) => !o)}
              title="Add entry"
              aria-label="Add entry"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xl font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              +
            </button>
            {addMenuOpen ? (
              <div
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border shadow-[var(--shadow)]"
                style={{ borderColor: "var(--line)", background: "#fff" }}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
                  onClick={() => {
                    setAddMenuOpen(false);
                    openAddEntry("receipt");
                  }}
                >
                  Receipt (in)
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
                  onClick={() => {
                    setAddMenuOpen(false);
                    openAddEntry("voucher");
                  }}
                >
                  Payment (out)
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Summary + chart */}
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-3">
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background: "linear-gradient(145deg, #d8f0e4 0%, #a8dcc8 45%, #6fbf9a 100%)",
              boxShadow: "var(--shadow)",
              color: "#000",
            }}
          >
            <div
              className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full opacity-20"
              style={{ background: "#fff" }}
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium opacity-85">Closing Balance</p>
                <p className="mt-2 text-[34px] font-bold tabular-nums leading-none tracking-tight">
                  {formatMoney(closing)}
                </p>
              </div>
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "rgba(0,0,0,0.08)", color: "#000" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM3 8l2-3h14l2 3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </span>
            </div>
            {closingDeltaPct != null ? (
              <p className="mt-3 text-[13px] opacity-90">
                <span
                  className="mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: "rgba(0,0,0,0.1)", color: "#000" }}
                >
                  {closingDeltaPct >= 0 ? "+" : ""}
                  {closingDeltaPct.toFixed(1)}%
                </span>
                vs opening ({formatMoney(opening)})
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {rangeActive ? "Period Receipts (Cr)" : "Today's Receipts (Cr)"}
                </p>
                <span style={{ color: "var(--income)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 19V5M12 5l-5 5M12 5l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-3 text-[22px] font-bold tabular-nums" style={{ color: "var(--income)" }}>
                {formatMoney(receiptTotal + advanceRepaidTotal)}
              </p>
            </div>

            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {rangeActive ? "Period Payments + Advances (Dr)" : "Today's Payments + Advances (Dr)"}
                </p>
                <span style={{ color: "var(--danger)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M12 19l-5-5M12 19l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-3 text-[22px] font-bold tabular-nums" style={{ color: "var(--danger)" }}>
                {formatMoney(voucherTotal + advanceOutTotal)}
              </p>
            </div>
          </div>
        </div>

        <div
          className="relative rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[19px] font-semibold">Cash Flow (₹)</h3>
            <div
              className="inline-flex rounded-lg border p-0.5 text-xs font-semibold"
              style={{ borderColor: "var(--line)" }}
            >
              {(["daily", "weekly", "monthly"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className="rounded-md px-2.5 py-1 capitalize"
                  style={{
                    background: chartMode === mode ? "var(--accent)" : "transparent",
                    color: chartMode === mode ? "#fff" : "var(--ink-muted)",
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-2 flex gap-4 text-[12px]" style={{ color: "var(--ink-muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--income)" }} />
              Receipts
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--danger)" }} />
              Payments / Advances
            </span>
          </div>
          {cashFlow.length === 0 ? (
            <p className="flex h-44 items-center justify-center text-sm" style={{ color: "var(--ink-muted)" }}>
              No cash movement to chart yet.
            </p>
          ) : (
            <div className="relative h-44">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to top, transparent, transparent 35px, var(--line) 35px, var(--line) 36px)",
                  opacity: 0.45,
                }}
              />
              <div className="relative z-[1] flex h-full items-end gap-2 overflow-x-auto px-1 pb-7">
                {cashFlow.map((d) => (
                  <div
                    key={d.key}
                    className="group flex min-w-[2.75rem] flex-1 flex-col items-center gap-1"
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoverBar({
                        label: d.label,
                        credit: d.credit,
                        debit: d.debit,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoverBar(null)}
                  >
                    <div className="flex h-32 w-full items-end justify-center gap-1">
                      <div
                        className="w-3 rounded-t-md transition group-hover:opacity-90"
                        style={{
                          height: `${Math.max(d.credit ? 6 : 2, (d.credit / cashFlowMax) * 100)}%`,
                          background: "var(--income)",
                        }}
                      />
                      <div
                        className="w-3 rounded-t-md transition group-hover:opacity-90"
                        style={{
                          height: `${Math.max(d.debit ? 6 : 2, (d.debit / cashFlowMax) * 100)}%`,
                          background: "var(--danger)",
                        }}
                      />
                    </div>
                    <span className="max-w-[4rem] truncate text-[10px]" style={{ color: "var(--ink-muted)" }}>
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hoverBar ? (
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-2 text-xs shadow-[var(--shadow)]"
              style={{
                left: hoverBar.x,
                top: hoverBar.y - 8,
                borderColor: "var(--line)",
                background: "#fff",
              }}
            >
              <p className="font-semibold">{hoverBar.label}</p>
              <p style={{ color: "var(--income)" }}>In {formatMoney(hoverBar.credit)}</p>
              <p style={{ color: "var(--danger)" }}>Out {formatMoney(hoverBar.debit)}</p>
            </div>
          ) : null}
        </div>
      </div>

      {error && !entryFormOpen && !openingEditOpen ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      {/* Transactions */}
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
          <h3 className="text-[19px] font-semibold">Transactions</h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border p-0.5 text-sm font-semibold"
              style={{ borderColor: "var(--line)" }}
            >
              {(
                [
                  ["all", `All (${statementRows.length})`],
                  ["receipts", `Receipts (${receiptCount})`],
                  ["vouchers", `Payments (${voucherCount})`],
                  ["advances", `Advances (${advanceCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTxFilter(id)}
                  className="rounded-md px-3 py-1.5"
                  style={{
                    background: txFilter === id ? "var(--accent)" : "transparent",
                    color: txFilter === id ? "#fff" : "var(--ink-muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{ color: "var(--ink-muted)" }}
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search…"
                className="w-40 rounded-lg border py-1.5 pl-8 pr-2 text-sm sm:w-52"
                style={{ borderColor: "var(--line)", background: "#fff" }}
              />
            </div>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
              onClick={() => setTableSearch("")}
            >
              Filters
            </button>
            {canExport ? (
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                onClick={exportCsv}
              >
                Export
              </button>
            ) : null}
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
              style={{
                background: dayStatus === "approved" ? "var(--accent-soft)" : "var(--warn-soft)",
                color: dayStatus === "approved" ? "var(--accent)" : "var(--warn)",
              }}
            >
              Status: {dayStatus.replace("_", " ")}
            </span>
          </div>
        </div>

        <div className="max-h-[34rem] overflow-auto">
          <table className="min-w-full text-left text-[15px]">
            <thead
              className="sticky top-0 z-10"
              style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}
            >
              <tr>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">Particulars</th>
                <th className="px-3 py-3 font-semibold">Receipt #</th>
                <th className="px-3 py-3 font-semibold">Payment #</th>
                <th className="px-3 py-3 text-right font-semibold">Receipts (Cr)</th>
                <th className="px-3 py-3 text-right font-semibold">Payments (Dr)</th>
                <th className="px-3 py-3 text-right font-semibold">Balance</th>
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--accent-soft)", borderTop: "1px solid var(--line)" }}>
                <td className="px-3 py-3 whitespace-nowrap">{formatRowDate(bookDate)}</td>
                <td className="px-3 py-3 font-medium">Opening balance</td>
                <td className="px-3 py-3">—</td>
                <td className="px-3 py-3">—</td>
                <td className="px-3 py-3 text-right">—</td>
                <td className="px-3 py-3 text-right">—</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(opening)}</td>
                <td className="px-3 py-3">
                  {editable ? (
                    <button
                      type="button"
                      disabled={busy || dayActionBusy}
                      onClick={openOpeningEdit}
                      title="Edit opening"
                      aria-label="Edit opening"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-60"
                      style={{ color: "var(--accent)", background: "#fff" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <path d="M13 6l3 3" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>

              {filteredRows.length === 0 ? (
                <tr style={{ borderTop: "1px solid var(--line)" }}>
                  <td colSpan={8} className="px-3 py-10 text-center" style={{ color: "var(--ink-muted)" }}>
                    {statementRows.length === 0
                      ? "No receipts, vouchers, or advances yet."
                      : "No entries match your filters."}
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ line, credit, debit, balance }) => {
                  const rowDate =
                    line.kind === "advance_repay"
                      ? line.entry.repaid_date || line.entry.book_date
                      : line.kind === "advance"
                        ? line.entry.book_date
                        : line.entry.entry_date;
                  const particulars =
                    line.kind === "advance"
                      ? `${(line.entry.kind ?? "salary") === "commission" ? "Commission" : "Salary"} advance — ${line.entry.person_name}${
                          line.entry.status === "pending"
                            ? " (pending)"
                            : line.entry.status === "repaid"
                              ? " (repaid)"
                              : ""
                        }`
                      : line.kind === "advance_repay"
                        ? `Advance repaid — ${line.entry.person_name}`
                        : line.entry.description;
                  return (
                    <tr
                      key={line.key}
                      className="transition hover:bg-[var(--bg-deep)]/60"
                      style={{ borderTop: "1px solid var(--line)" }}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">{formatRowDate(rowDate)}</td>
                      <td className="px-3 py-3">{particulars}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {line.kind === "receipt" ? line.entry.receipt_number : "—"}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {line.kind === "voucher" ? (
                          <button
                            type="button"
                            className="font-medium underline-offset-2 hover:underline"
                            style={{ color: "var(--accent)" }}
                            onClick={() => startEdit(line)}
                          >
                            {line.entry.voucher_number}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
                        style={{ color: "var(--income)" }}
                      >
                        {credit ? formatMoney(credit) : "—"}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
                        style={{ color: "var(--danger)" }}
                      >
                        {debit ? formatMoney(debit) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatMoney(balance)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {editable && (line.kind === "receipt" || line.kind === "voucher") ? (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              title="Edit"
                              aria-label="Edit"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                              style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
                              onClick={() => startEdit(line)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path
                                  d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinejoin="round"
                                />
                                <path d="M13 6l3 3" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              aria-label="Delete"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                              style={{ color: "var(--danger)", background: "var(--danger-soft)" }}
                              onClick={async () => {
                                const num =
                                  line.kind === "receipt"
                                    ? line.entry.receipt_number
                                    : line.entry.voucher_number;
                                if (!confirm(`Delete ${num}?`)) return;
                                setBusy(true);
                                try {
                                  if (line.kind === "receipt") await onDeleteReceipt(line.entry.id);
                                  else await onDeleteVoucher(line.entry.id);
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Delete failed");
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path
                                  d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 13h8l1-13"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--line)" }}>
                <td className="px-3 py-3.5 font-semibold" colSpan={4}>
                  Closing balance
                </td>
                <td className="px-3 py-3.5 text-right font-bold tabular-nums" style={{ color: "var(--income)" }}>
                  {formatMoney(receiptTotal + advanceRepaidTotal)}
                </td>
                <td className="px-3 py-3.5 text-right font-bold tabular-nums" style={{ color: "var(--danger)" }}>
                  {formatMoney(voucherTotal + advanceOutTotal)}
                </td>
                <td className="px-3 py-3.5 text-right font-bold tabular-nums">{formatMoney(closing)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showApprove || showUnlock ? (
        <div className="flex justify-end gap-2">
          {showApprove ? (
            <button
              type="button"
              disabled={dayActionBusy}
              onClick={onApproveDay}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Approve day
            </button>
          ) : null}
          {showUnlock ? (() => {
            const progress = Math.min(1, unlockHoldMs / UNLOCK_HOLD_MS);
            const unlocked = unlockDone || progress >= 1;
            return (
              <button
                type="button"
                disabled={dayActionBusy || unlockDone}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                  startUnlockHold();
                }}
                onPointerUp={() => stopUnlockHold(true)}
                onPointerCancel={() => stopUnlockHold(true)}
                onPointerLeave={() => stopUnlockHold(true)}
                onContextMenu={(e) => e.preventDefault()}
                className="relative overflow-hidden select-none rounded-lg border px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
                style={{
                  borderColor: unlocked ? "var(--accent)" : "var(--line)",
                  background: "var(--panel)",
                  color: unlocked ? "var(--accent)" : "var(--ink)",
                  minWidth: "11.5rem",
                  touchAction: "none",
                }}
                aria-label="Hold for 3 seconds to unlock day"
                title="Hold for 3 seconds to unlock"
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
                  style={{
                    width: `${progress * 100}%`,
                    background: "linear-gradient(90deg, var(--accent-soft), #b8e0ce)",
                  }}
                />
                <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className={unlocked ? "animate-[unlockPop_0.45s_ease-out]" : undefined}
                  >
                    <g
                      style={{
                        transformOrigin: "16px 8px",
                        transform: unlocked
                          ? "translate(2px, -4px) rotate(-42deg)"
                          : `translate(${progress * 1.5}px, ${-progress * 3}px) rotate(${-progress * 28}deg)`,
                        transition: unlocked ? "transform 0.4s ease" : undefined,
                      }}
                    >
                      <path
                        d="M8 11V8a4 4 0 0 1 8 0v3"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </g>
                    <rect
                      x="6"
                      y="11"
                      width="12"
                      height="9"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
                  </svg>
                  {unlocked ? "Unlocked" : progress > 0 ? `Hold… ${Math.ceil((1 - progress) * 3)}s` : "Hold to unlock"}
                </span>
              </button>
            );
          })() : null}
        </div>
      ) : null}

      {openingEditOpen && editable ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opening-edit-title"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveOpening();
            }}
            className="w-full max-w-sm rounded-2xl border p-6 shadow-[var(--shadow)]"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <h2 id="opening-edit-title" className="text-2xl font-semibold">
              Opening balance
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
              Set opening for {formatDisplayDate(bookDate)}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Amount
              <input
                type="number"
                step="0.01"
                required
                autoFocus
                value={openingDraft}
                onChange={(e) => setOpeningDraft(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </label>
            {error ? (
              <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                Set
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpeningEditOpen(false);
                  setOpeningDraft(String(openingBalance));
                }}
                className="rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: "var(--line)", background: "#fff" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {entryFormOpen && editable ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-form-title"
        >
          <form
            onSubmit={submitForm}
            className="w-full max-w-md rounded-2xl border p-6 shadow-[var(--shadow)]"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <h2 id="entry-form-title" className="text-2xl font-semibold">
              {editing ? "Edit entry" : "Add entry"}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
              {editing ? "Update this receipt or voucher." : "Add a receipt or voucher to the cash book."}
            </p>
            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Type
                <select
                  value={addKind}
                  disabled={Boolean(editing)}
                  onChange={(e) => setAddKind(e.target.value as "receipt" | "voucher")}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  <option value="receipt">Receipt (in)</option>
                  <option value="voucher">Payment (out)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Date
                <input
                  type="date"
                  required
                  value={canChangeEntryDate ? entryDate : bookDate}
                  disabled={!canChangeEntryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-80"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--ink)",
                    background: canChangeEntryDate ? undefined : "var(--bg-deep)",
                  }}
                  title={canChangeEntryDate ? undefined : "Only Boss can change the entry date"}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Particulars
                <input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                  placeholder="Narration…"
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
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={cancelForm}
                className="rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: "var(--line)", background: "#fff" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
