"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatCountdown,
  formatDisplayDate,
  formatMoney,
  remainingEditMs,
} from "@/lib/dates";
import type { Advance, AdvanceKind, DayStatus } from "@/lib/types";

export type AdvancePick = Pick<
  Advance,
  "id" | "person_name" | "amount" | "repaid_amount" | "kind" | "status"
>;

export type EntryRow = {
  id: string;
  number: string;
  entry_date: string;
  description: string;
  amount: number;
  editable_until: string;
  created_by_name?: string;
};

type Props = {
  kind: "receipt" | "voucher";
  title: string;
  rows: EntryRow[];
  bookDate: string;
  dayStatus: DayStatus;
  dayOpen: boolean;
  /** Shown as the first receipts row (carry-forward). */
  openingBalance?: number;
  canEditOpeningBalance?: boolean;
  showApprove?: boolean;
  showUnlock?: boolean;
  showEditWindow?: boolean;
  /** Boss: edit/add/delete without the 10-minute window or day-open gate. */
  alwaysEditable?: boolean;
  canUnlockEntry?: boolean;
  dayActionBusy?: boolean;
  onApproveDay?: () => void;
  onUnlockDay?: () => void;
  rangeFrom?: string;
  rangeTo?: string;
  rangeActive?: boolean;
  /** When set, From/To cannot be changed (Accounts = today only). */
  dateRangeLocked?: boolean;
  /** When set, entry form date is fixed (Accounts = today). */
  lockedEntryDate?: string;
  onRangeFromChange?: (date: string) => void;
  onRangeToChange?: (date: string) => void;
  onApplyRange?: () => void;
  onClearRange?: () => void;
  onUpdateOpeningBalance?: (amount: number) => Promise<void>;
  onUnlockEntry?: (id: string) => Promise<void>;
  /** Approved advances available to recover via receipts. */
  recoverableAdvances?: AdvancePick[];
  onAdd: (input: {
    description: string;
    amount: number;
    entry_date: string;
    advance_id?: string;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    input: { description: string; amount: number; entry_date: string },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function detectAdvanceKindFromDescription(text: string): AdvanceKind | null {
  const t = text.trim().toLowerCase();
  if (/advance\s*salary|salary\s*advance/.test(t)) return "salary";
  if (/advance\s*commission|commission\s*advance/.test(t)) return "commission";
  return null;
}

function advanceOutstanding(a: AdvancePick) {
  return Math.max(0, Number(a.amount) - Number(a.repaid_amount ?? 0));
}

function canEditRow(
  row: EntryRow,
  dayOpen: boolean,
  now: number,
  alwaysEditable: boolean,
) {
  if (alwaysEditable) return true;
  return dayOpen && remainingEditMs(row.editable_until, now) > 0;
}

function isValidEntryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function validateEntryFields(input: {
  entryDate: string;
  description: string;
  amount: string;
}) {
  if (!input.entryDate.trim()) return "Date is required";
  if (!isValidEntryDate(input.entryDate.trim())) {
    return "Date must be YYYY-MM-DD (example: 2026-11-13)";
  }
  if (!input.description.trim()) return "Description is required";
  if (!input.amount.trim()) return "Amount is required";
  const n = Number(input.amount);
  if (!Number.isFinite(n) || n < 0) return "Enter a valid amount";
  return null;
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EntriesPanel({
  kind,
  title,
  rows,
  bookDate,
  dayStatus,
  dayOpen,
  openingBalance,
  canEditOpeningBalance = false,
  showApprove,
  showUnlock,
  showEditWindow = false,
  alwaysEditable = false,
  canUnlockEntry = false,
  dayActionBusy,
  onApproveDay,
  onUnlockDay,
  rangeFrom,
  rangeTo,
  rangeActive = false,
  dateRangeLocked = false,
  lockedEntryDate,
  onRangeFromChange,
  onRangeToChange,
  onApplyRange,
  onClearRange,
  onUpdateOpeningBalance,
  onUnlockEntry,
  recoverableAdvances = [],
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const showDateRange = Boolean(
    onRangeFromChange && onRangeToChange && onApplyRange && rangeFrom && rangeTo,
  );
  const showOpeningBalance = kind === "receipt" && openingBalance !== undefined;
  const openingAmount = Number(openingBalance ?? 0);
  // Opening balance always owns R-YYYY-0001; real receipts continue from 0002.
  const openingNumber = `R-${bookDate.slice(0, 4)}-0001`;
  const [now, setNow] = useState(() => Date.now());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(bookDate);
  const [advanceId, setAdvanceId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingDraft, setOpeningDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openingAmountRef = useRef<HTMLInputElement>(null);

  const dateRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (editingId) return;
    setEntryDate(lockedEntryDate || bookDate);
  }, [bookDate, editingId, lockedEntryDate]);

  const formOpen = Boolean(editingId) || showForm;

  useEffect(() => {
    if (!formOpen) return;
    const id = window.setTimeout(() => dateRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [formOpen, editingId]);

  useEffect(() => {
    if (!editingOpening) return;
    const id = window.setTimeout(() => {
      openingAmountRef.current?.focus();
      openingAmountRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [editingOpening]);

  async function saveOpeningBalance(e: React.FormEvent) {
    e.preventDefault();
    if (!onUpdateOpeningBalance || !canEditOpeningBalance) return;
    const raw = openingDraft.trim();
    if (!raw) {
      setError("Opening balance is required");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter a valid opening balance");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpdateOpeningBalance(n);
      setEditingOpening(false);
      setOpeningDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update opening balance");
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.description.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const total = useMemo(() => {
    const entries = filteredRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const includeOpening = showOpeningBalance && !searchQuery.trim();
    return includeOpening ? openingAmount + entries : entries;
  }, [filteredRows, showOpeningBalance, openingAmount, searchQuery]);

  const canCreate = alwaysEditable || (dayOpen && dayStatus === "open");
  const showOpeningInTable = showOpeningBalance && !searchQuery.trim();
  const matchedAdvanceKind =
    kind === "receipt" ? detectAdvanceKindFromDescription(description) : null;
  const advancePeople = useMemo(() => {
    if (!matchedAdvanceKind) return [];
    return recoverableAdvances
      .filter(
        (a) =>
          (a.kind ?? "salary") === matchedAdvanceKind &&
          a.status === "approved" &&
          advanceOutstanding(a) > 0,
      )
      .sort((a, b) => a.person_name.localeCompare(b.person_name));
  }, [recoverableAdvances, matchedAdvanceKind]);

  useEffect(() => {
    if (!matchedAdvanceKind) {
      setAdvanceId("");
      return;
    }
    if (advanceId && !advancePeople.some((a) => a.id === advanceId)) {
      setAdvanceId("");
    }
  }, [matchedAdvanceKind, advancePeople, advanceId]);

  function focusNextFromDate() {
    descriptionRef.current?.focus();
    descriptionRef.current?.select();
  }

  function focusNextFromDescription() {
    if (matchedAdvanceKind && advancePeople.length > 0) {
      const el = document.getElementById("advance-person-select");
      if (el instanceof HTMLSelectElement) {
        el.focus();
        return;
      }
    }
    amountRef.current?.focus();
    amountRef.current?.select();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const dateValue = (lockedEntryDate || entryDate).trim();
    const validationError = validateEntryFields({
      entryDate: dateValue,
      description,
      amount,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (matchedAdvanceKind) {
      if (advancePeople.length === 0) {
        setError(
          matchedAdvanceKind === "salary"
            ? "No approved salary advances to recover. Add/approve a salary advance first."
            : "No approved commission advances to recover. Add/approve a commission advance first.",
        );
        return;
      }
      if (!advanceId) {
        setError("Select the person whose advance this receipt recovers");
        return;
      }
      const picked = advancePeople.find((a) => a.id === advanceId);
      const outstanding = picked ? advanceOutstanding(picked) : 0;
      if (picked && Number(amount) > outstanding) {
        setError(
          `Amount cannot exceed outstanding ${formatMoney(outstanding)} for ${picked.person_name}`,
        );
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const person = advancePeople.find((a) => a.id === advanceId);
      const label =
        matchedAdvanceKind === "salary"
          ? "Advance salary"
          : matchedAdvanceKind === "commission"
            ? "Advance commission"
            : null;
      const desc =
        label && person
          ? `${label} — ${person.person_name}`
          : description.trim();
      await onAdd({
        description: desc,
        amount: Number(amount),
        entry_date: dateValue,
        advance_id: matchedAdvanceKind && advanceId ? advanceId : undefined,
      });
      setDescription("");
      setAmount("");
      setAdvanceId("");
      setEntryDate(lockedEntryDate || bookDate);
      // Keep form open for fast entry; jump back to description after date stays
      window.setTimeout(() => descriptionRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const dateValue = (lockedEntryDate || entryDate).trim();
    const validationError = validateEntryFields({
      entryDate: dateValue,
      description,
      amount,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpdate(editingId, {
        description: description.trim(),
        amount: Number(amount),
        entry_date: dateValue,
      });
      setEditingId(null);
      setShowForm(false);
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
    setShowForm(true);
    setDescription(row.description);
    setAmount(String(row.amount));
    setEntryDate(row.entry_date);
    setError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setShowForm(false);
    setDescription("");
    setAmount("");
    setAdvanceId("");
    setEntryDate(bookDate);
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
            Numbers auto-generate and never repeat.
            {alwaysEditable
              ? " Boss can edit anytime."
              : " Edit window: 10 minutes after create."}{" "}
            Press Enter to move to the next field; Enter on Amount adds the entry.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Search
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Description…"
              className="min-w-[10rem] rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
            />
          </label>
          {showDateRange ? (
            <div
              className="flex flex-wrap items-end gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                From
                <input
                  type="date"
                  value={rangeFrom}
                  disabled={dayActionBusy || dateRangeLocked}
                  onChange={(e) => onRangeFromChange?.(e.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                To
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom}
                  disabled={dayActionBusy || dateRangeLocked}
                  onChange={(e) => onRangeToChange?.(e.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                />
              </label>
              {!dateRangeLocked ? (
                <button
                  type="button"
                  disabled={dayActionBusy}
                  onClick={() => onApplyRange?.()}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  Apply
                </button>
              ) : null}
              {rangeActive && onClearRange && !dateRangeLocked ? (
                <button
                  type="button"
                  disabled={dayActionBusy}
                  onClick={() => onClearRange()}
                  className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          {canCreate && !formOpen ? (
            <button
              type="button"
              aria-label={kind === "receipt" ? "Add receipt" : "Add voucher"}
              onClick={() => {
                setShowForm(true);
                setEditingId(null);
                setDescription("");
                setAmount("");
                setEntryDate(bookDate);
                setError(null);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl font-semibold leading-none text-white"
              style={{ background: "var(--accent)" }}
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      {!canCreate && !editingId ? (
        <p className="mb-4 text-sm" style={{ color: "var(--ink-muted)" }}>
          {dayStatus === "approved"
            ? "This day is approved and locked."
            : dayStatus === "pending_approval"
              ? "Waiting for Boss approval — editing closed."
              : "Editing is closed for this day."}
        </p>
      ) : null}

      {formOpen && (canCreate || editingId) ? (
        <form
          onSubmit={editingId ? submitEdit : submitAdd}
          className="mb-5 grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1.4fr_0.8fr_auto]"
          style={{ borderColor: "var(--line)", background: "#fff" }}
          noValidate
        >
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Date
            <input
              ref={dateRef}
              type="text"
              required
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              value={
                lockedEntryDate ? formatDisplayDate(lockedEntryDate) : entryDate
              }
              readOnly={Boolean(lockedEntryDate)}
              onChange={(e) => {
                if (lockedEntryDate) return;
                setEntryDate(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                focusNextFromDate();
              }}
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: lockedEntryDate ? "var(--bg-deep)" : "#fff",
              }}
              title={lockedEntryDate ? "Only Boss can change the entry date" : undefined}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Description
            <input
              ref={descriptionRef}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                focusNextFromDescription();
              }}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder={
                kind === "receipt"
                  ? "Cash received from… (or Advance salary / Advance commission)"
                  : "Paid to…"
              }
            />
          </label>
          {matchedAdvanceKind ? (
            <label className="flex flex-col gap-1 text-xs md:col-span-2" style={{ color: "var(--ink-muted)" }}>
              Person ({matchedAdvanceKind === "salary" ? "salary advance" : "commission advance"})
              <select
                id="advance-person-select"
                required
                value={advanceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAdvanceId(id);
                  const picked = advancePeople.find((a) => a.id === id);
                  if (picked && !amount) {
                    setAmount(String(advanceOutstanding(picked)));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  amountRef.current?.focus();
                  amountRef.current?.select();
                }}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              >
                <option value="">
                  {advancePeople.length === 0
                    ? "No approved advances with balance"
                    : "Select person…"}
                </option>
                {advancePeople.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.person_name} — due {formatMoney(advanceOutstanding(a))}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Amount
            <input
              ref={amountRef}
              required
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Allow native form submit via Enter on the last field
              }}
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
            <button
              type="button"
              onClick={cancelForm}
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
              <th className="px-3 py-2.5 font-medium">
                {kind === "receipt" ? "Receipt #" : "Voucher #"}
              </th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">User</th>
              {showEditWindow ? (
                <th className="w-0 px-2 py-2.5 text-center text-xs font-medium" title="Edit window">
                  Window
                </th>
              ) : null}
              <th className="w-0 px-2 py-2.5 text-center text-xs font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showOpeningInTable ? (
              <tr className="border-t" style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">1</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDisplayDate(bookDate)}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {openingNumber}
                </td>
                <td className="px-3 py-2.5 font-medium">Opening balance</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap font-medium">
                  {editingOpening ? (
                    <form onSubmit={saveOpeningBalance} className="inline-flex items-center justify-end gap-2">
                      <input
                        ref={openingAmountRef}
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={openingDraft}
                        onChange={(e) => setOpeningDraft(e.target.value)}
                        disabled={busy || dayActionBusy}
                        className="w-28 rounded-md border px-2 py-1 text-right text-sm"
                        style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
                      />
                      <button
                        type="submit"
                        disabled={busy || dayActionBusy}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: "var(--accent)" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busy || dayActionBusy}
                        onClick={() => {
                          setEditingOpening(false);
                          setOpeningDraft("");
                          setError(null);
                        }}
                        className="rounded-md border px-2 py-1 text-xs disabled:opacity-60"
                        style={{ borderColor: "var(--line)", background: "#fff" }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    formatMoney(openingAmount)
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--ink-muted)" }}>
                  —
                </td>
                {showEditWindow ? <td className="w-0 px-2 py-2.5" /> : null}
                <td className="w-0 px-2 py-2.5 whitespace-nowrap">
                  {canEditOpeningBalance && onUpdateOpeningBalance && !editingOpening ? (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        aria-label="Edit opening balance"
                        title="Edit opening balance"
                        disabled={busy || dayActionBusy}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
                        style={{ color: "var(--accent)" }}
                        onClick={() => {
                          setEditingId(null);
                          setShowForm(false);
                          setEditingOpening(true);
                          setOpeningDraft(String(openingAmount));
                          setError(null);
                        }}
                      >
                        <EditIcon />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ) : null}
            {filteredRows.length === 0 && !showOpeningInTable ? (
              <tr>
                <td
                  colSpan={showEditWindow ? 8 : 7}
                  className="px-3 py-8 text-center"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {searchQuery.trim()
                    ? "No matching descriptions."
                    : "No entries yet."}
                </td>
              </tr>
            ) : null}
            {filteredRows.map((row, index) => {
                const slNo = (showOpeningInTable ? 1 : 0) + index + 1;
                const editable = canEditRow(row, dayOpen, now, alwaysEditable);
                const left = remainingEditMs(row.editable_until, now);
                const canUnlock = Boolean(
                  !alwaysEditable && canUnlockEntry && onUnlockEntry,
                );

                async function unlockRow(): Promise<boolean> {
                  if (!onUnlockEntry) return false;
                  if (
                    !confirm(
                      dayOpen
                        ? `Unlock ${row.number} for 10 more minutes?`
                        : `This day is locked. Unlock the day and reopen ${row.number} for 10 minutes?`,
                    )
                  ) {
                    return false;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    await onUnlockEntry(row.id);
                    return true;
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Unlock failed");
                    return false;
                  } finally {
                    setBusy(false);
                  }
                }

                return (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{slNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDisplayDate(row.entry_date)}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.number}</td>
                    <td className="px-3 py-2.5">{row.description}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.created_by_name?.trim() || "—"}
                    </td>
                    {showEditWindow ? (
                      <td className="w-0 px-2 py-2.5 text-center whitespace-nowrap">
                        {alwaysEditable ? (
                          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                            —
                          </span>
                        ) : editable ? (
                          <span className="text-xs tabular-nums" style={{ color: "var(--warn)" }}>
                            {formatCountdown(left)}
                          </span>
                        ) : canUnlock ? (
                          <button
                            type="button"
                            disabled={busy || dayActionBusy}
                            title="Click to unlock (Boss only)"
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none transition hover:opacity-80 disabled:opacity-60"
                            style={{ background: "var(--locked-soft)", color: "var(--locked)" }}
                            onClick={() => void unlockRow()}
                          >
                            Locked
                          </button>
                        ) : (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                            style={{ background: "var(--locked-soft)", color: "var(--locked)" }}
                          >
                            Locked
                          </span>
                        )}
                      </td>
                    ) : null}
                    <td className="w-0 px-2 py-2.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {editable ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Edit ${row.number}`}
                              title="Edit"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[var(--accent-soft)]"
                              style={{ color: "var(--accent)" }}
                              onClick={() => startEdit(row)}
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${row.number}`}
                              title="Delete"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[var(--danger-soft)]"
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
                              <DeleteIcon />
                            </button>
                          </>
                        ) : canUnlock ? (
                          <button
                            type="button"
                            disabled={busy || dayActionBusy}
                            aria-label={`Unlock and edit ${row.number}`}
                            title="Unlock and edit"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
                            style={{ color: "var(--accent)" }}
                            onClick={async () => {
                              const unlocked = await unlockRow();
                              if (unlocked) startEdit(row);
                            }}
                          >
                            <EditIcon />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-label="Editing locked"
                            title="Locked"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md opacity-40"
                            style={{ color: "var(--ink-muted)" }}
                          >
                            <EditIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {showApprove ? (
          <button
            type="button"
            disabled={dayActionBusy}
            onClick={onApproveDay}
            className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            Approve
          </button>
        ) : null}
        {showUnlock ? (
          <button
            type="button"
            disabled={dayActionBusy}
            onClick={onUnlockDay}
            className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--line)", background: "#fff" }}
          >
            Unlock
          </button>
        ) : null}
        <p className="text-lg font-semibold">Total {formatMoney(total)}</p>
      </div>
    </section>
  );
}
