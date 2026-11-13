"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountMenu } from "@/components/account-menu";
import { ActivityLog } from "@/components/activity-log";
import { ApprovalModal } from "@/components/approval-modal";
import { EntriesPanel } from "@/components/entries-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { StatusBadge } from "@/components/status-badge";
import { UsersPanel } from "@/components/users-panel";
import {
  formatMoney,
  isPastCloseTime,
  todayBookDate,
} from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type {
  AuditLog,
  CashBookDay,
  Profile,
  Receipt,
  Voucher,
} from "@/lib/types";

type Tab = "receipts" | "vouchers" | "activity" | "users" | "profile";

type Props = {
  initialDate: string;
  profile: Profile;
  initialDay: CashBookDay;
  initialReceipts: Receipt[];
  initialVouchers: Voucher[];
  initialLogs: AuditLog[];
};

function laterKey(date: string) {
  return `cashbook-later-${date}`;
}

export function CashBookApp({
  initialDate,
  profile,
  initialDay,
  initialReceipts,
  initialVouchers,
  initialLogs,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [bookDate, setBookDate] = useState(initialDate);
  const [day, setDay] = useState(initialDay);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [vouchers, setVouchers] = useState(initialVouchers);
  const [logs, setLogs] = useState(initialLogs);
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [tab, setTab] = useState<Tab>("receipts");
  const [showApproval, setShowApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(initialDate);
  const [rangeTo, setRangeTo] = useState(initialDate);
  const [rangeActive, setRangeActive] = useState(false);

  const isBoss = currentProfile.role === "boss";
  const isToday = bookDate === todayBookDate();
  const dayOpen = day.status === "open" && !rangeActive;
  const timezone =
    process.env.NEXT_PUBLIC_CASHBOOK_TIMEZONE ?? "America/Los_Angeles";

  const loadDay = useCallback(
    async (date: string, closedDay?: CashBookDay | null) => {
      const [{ data: dayFallback }, { data: receiptRows }, { data: voucherRows }, { data: logRows }] =
        await Promise.all([
          supabase.from("cash_book_days").select("*").eq("book_date", date).single(),
          supabase
            .from("receipts")
            .select("*")
            .eq("book_date", date)
            .order("created_at", { ascending: true }),
          supabase
            .from("vouchers")
            .select("*")
            .eq("book_date", date)
            .order("created_at", { ascending: true }),
          supabase
            .from("audit_logs")
            .select("*")
            .eq("book_date", date)
            .order("created_at", { ascending: false }),
        ]);

      const dayRow = closedDay ?? (dayFallback as CashBookDay | null);
      if (dayRow) setDay(dayRow);
      setReceipts((receiptRows as Receipt[]) ?? []);
      setVouchers((voucherRows as Voucher[]) ?? []);
      setLogs((logRows as AuditLog[]) ?? []);
    },
    [supabase],
  );

  const refresh = useCallback(
    async (date: string) => {
      const { error: ensureError } = await supabase.rpc("ensure_cash_book_day", {
        p_date: date,
      });
      if (ensureError) throw ensureError;

      const { data: closedDay } = await supabase.rpc("close_cash_book_day_if_due", {
        p_date: date,
        p_timezone: timezone,
      });

      await loadDay(date, closedDay as CashBookDay | null);
    },
    [loadDay, supabase, timezone],
  );

  useEffect(() => {
    setBookDate(initialDate);
    setDay(initialDay);
    setReceipts(initialReceipts);
    setVouchers(initialVouchers);
    setLogs(initialLogs);
  }, [initialDate, initialDay, initialReceipts, initialVouchers, initialLogs]);

  // Keep every open session in sync when any user adds/edits/deletes entries.
  useEffect(() => {
    const channel = supabase
      .channel(`cashbook-live-${bookDate}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "receipts",
          filter: `book_date=eq.${bookDate}`,
        },
        () => {
          if (!rangeActive) void loadDay(bookDate);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vouchers",
          filter: `book_date=eq.${bookDate}`,
        },
        () => {
          if (!rangeActive) void loadDay(bookDate);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_book_days",
          filter: `book_date=eq.${bookDate}`,
        },
        () => {
          if (!rangeActive) void loadDay(bookDate);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_logs",
          filter: `book_date=eq.${bookDate}`,
        },
        () => {
          if (!rangeActive) void loadDay(bookDate);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookDate, loadDay, rangeActive, supabase]);

  useEffect(() => {
    if (!isBoss || !isToday || rangeActive) {
      setShowApproval(false);
      return;
    }
    const dismissed =
      typeof window !== "undefined" &&
      sessionStorage.getItem(laterKey(bookDate)) === "1";
    const needsApproval =
      day.status === "pending_approval" ||
      (day.status === "open" && isPastCloseTime());
    setShowApproval(needsApproval && !dismissed);
  }, [isBoss, isToday, bookDate, day.status, rangeActive]);

  async function onDateChange(next: string) {
    setBookDate(next);
    setRangeFrom(next);
    setRangeTo(next);
    setRangeActive(false);
    setBusy(true);
    setMessage(null);
    try {
      await refresh(next);
      router.replace(`/?date=${next}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load day");
    } finally {
      setBusy(false);
    }
  }

  async function applyDateRange() {
    if (!isBoss) return;
    if (!rangeFrom || !rangeTo) {
      setMessage("Choose From and To dates");
      return;
    }
    if (rangeFrom > rangeTo) {
      setMessage("From date must be on or before To date");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await supabase.rpc("ensure_cash_book_day", { p_date: rangeFrom });
      const [{ data: fromDay }, { data: receiptRows }, { data: voucherRows }, { data: logRows }] =
        await Promise.all([
          supabase.from("cash_book_days").select("*").eq("book_date", rangeFrom).single(),
          supabase
            .from("receipts")
            .select("*")
            .gte("book_date", rangeFrom)
            .lte("book_date", rangeTo)
            .order("book_date", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("vouchers")
            .select("*")
            .gte("book_date", rangeFrom)
            .lte("book_date", rangeTo)
            .order("book_date", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("audit_logs")
            .select("*")
            .gte("book_date", rangeFrom)
            .lte("book_date", rangeTo)
            .order("created_at", { ascending: false }),
        ]);

      if (fromDay) setDay(fromDay as CashBookDay);
      setReceipts((receiptRows as Receipt[]) ?? []);
      setVouchers((voucherRows as Voucher[]) ?? []);
      setLogs((logRows as AuditLog[]) ?? []);
      setRangeActive(true);
      setBookDate(rangeFrom);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to apply date filter");
    } finally {
      setBusy(false);
    }
  }

  async function clearDateRange() {
    setRangeActive(false);
    setRangeFrom(bookDate);
    setRangeTo(bookDate);
    setBusy(true);
    setMessage(null);
    try {
      await refresh(bookDate);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to clear filter");
    } finally {
      setBusy(false);
    }
  }

  /** Entry date owns the sheet — amounts always live on that day's book. */
  async function placeOnSheet(entryDate: string) {
    const sheetDate = entryDate || bookDate;
    const { error } = await supabase.rpc("ensure_cash_book_day", {
      p_date: sheetDate,
    });
    if (error) throw error;
    return sheetDate;
  }

  async function afterEntrySaved(sheetDate: string) {
    await supabase.rpc("recompute_opening_balances_from", { p_from: sheetDate });
    if (sheetDate === bookDate) {
      await refresh(bookDate);
      return;
    }
    await onDateChange(sheetDate);
  }

  async function approve() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc("approve_cash_book_day", {
        p_date: bookDate,
      });
      if (error) throw error;
      sessionStorage.removeItem(laterKey(bookDate));
      setShowApproval(false);
      await refresh(bookDate);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  function later() {
    sessionStorage.setItem(laterKey(bookDate), "1");
    setShowApproval(false);
  }

  async function unlock() {
    if (!confirm("Unlock this day for editing?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("unlock_cash_book_day", {
        p_date: bookDate,
      });
      if (error) throw error;
      await refresh(bookDate);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const receiptTotal = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const voucherTotal = vouchers.reduce((s, r) => s + Number(r.amount), 0);
  const isProfileView = tab === "profile";
  const isUsersView = tab === "users" && isBoss;
  const isActivityView = tab === "activity";

  if (isProfileView || isUsersView || isActivityView) {
    return (
      <div
        className={`mx-auto flex w-full flex-1 flex-col px-4 py-8 ${
          isProfileView ? "max-w-2xl" : "max-w-6xl"
        }`}
      >
        <button
          type="button"
          onClick={() => setTab("receipts")}
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition hover:bg-[var(--bg-deep)]"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
            fontFamily: "var(--font-body)",
          }}
        >
          <span aria-hidden="true">←</span>
          Back
        </button>

        {isProfileView ? (
          <ProfilePanel
            profile={currentProfile}
            onProfileUpdated={setCurrentProfile}
            onDataWiped={async () => {
              setTab("receipts");
              setBusy(true);
              setMessage(null);
              try {
                await refresh(bookDate);
                router.refresh();
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Failed to reload after wipe");
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}

        {isUsersView ? (
          <div
            className="rounded-2xl border p-5 shadow-[var(--shadow)]"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <UsersPanel />
          </div>
        ) : null}

        {isActivityView ? (
          <div
            className="rounded-2xl border p-5 shadow-[var(--shadow)]"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <section>
              <h2 className="mb-2 text-2xl font-semibold">Log</h2>
              <p className="mb-4 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
                Every create, edit, and delete by Boss or Accounts is recorded for this day.
              </p>
              <ActivityLog logs={logs} />
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Cash Book</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
            {currentProfile.full_name?.trim() || (isBoss ? "Boss" : "Accounts")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: "var(--font-body)" }}>
          <StatusBadge status={day.status} />
          <AccountMenu
            profile={currentProfile}
            isBoss={isBoss}
            onOpenProfile={() => setTab("profile")}
            onOpenActivity={() => setTab("activity")}
            onOpenUsers={() => setTab("users")}
            onSignOut={signOut}
          />
        </div>
      </header>

      {message ? (
        <p className="mt-4 text-sm" style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>
          {message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3" style={{ fontFamily: "var(--font-body)" }}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["receipts", "Receipts", "var(--accent)"] as const,
              ["vouchers", "Cash voucher", "var(--danger)"] as const,
            ]
          ).map(([id, label, activeColor]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="rounded-full px-4 py-2 text-sm font-semibold transition"
              style={{
                background: tab === id ? activeColor : "var(--panel)",
                color: tab === id ? "#fff" : "var(--ink)",
                border: `1px solid ${tab === id ? activeColor : "var(--line)"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {isBoss ? (
          <div
            className="flex flex-wrap items-end gap-2 rounded-xl border px-3 py-2"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              From
              <input
                type="date"
                value={rangeFrom}
                disabled={busy}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              To
              <input
                type="date"
                value={rangeTo}
                disabled={busy}
                onChange={(e) => setRangeTo(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyDateRange()}
              className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Apply
            </button>
            {rangeActive ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearDateRange()}
                className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {rangeActive ? (
        <p className="mt-3 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
          Showing {rangeFrom} to {rangeTo} (view only). Clear filter to edit a single day.
        </p>
      ) : null}

      <div className="mt-6 rounded-2xl border p-5 shadow-[var(--shadow)]" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
        {tab === "receipts" ? (
          <EntriesPanel
            kind="receipt"
            title="Receipts"
            bookDate={bookDate}
            dayStatus={day.status}
            dayOpen={dayOpen}
            openingBalance={rangeActive ? undefined : Number(day.opening_balance ?? 0)}
            canEditOpeningBalance={isBoss && !rangeActive}
            showApprove={!rangeActive && isBoss && day.status !== "approved"}
            showUnlock={!rangeActive && isBoss && day.status === "approved"}
            showEditWindow
            canUnlockEntry={isBoss && !rangeActive}
            dayActionBusy={busy}
            onApproveDay={approve}
            onUnlockDay={unlock}
            onDateChange={rangeActive ? undefined : onDateChange}
            onUpdateOpeningBalance={async (amount) => {
              const { error } = await supabase
                .from("cash_book_days")
                .update({ opening_balance: amount })
                .eq("book_date", bookDate);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
            onUnlockEntry={async (id) => {
              if (!dayOpen) {
                const { error: dayError } = await supabase.rpc("unlock_cash_book_day", {
                  p_date: bookDate,
                });
                if (dayError) throw dayError;
              }
              const { error } = await supabase.rpc("unlock_entry", {
                p_kind: "receipt",
                p_id: id,
              });
              if (error) throw error;
              await refresh(bookDate);
            }}
            rows={receipts.map((r) => ({
              id: r.id,
              number: r.receipt_number,
              entry_date: r.entry_date,
              description: r.description,
              amount: Number(r.amount),
              editable_until: r.editable_until,
            }))}
            onAdd={async (input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase.from("receipts").insert({
                book_date: sheetDate,
                entry_date: sheetDate,
                description: input.description,
                amount: input.amount,
                created_by: currentProfile.id,
              });
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onUpdate={async (id, input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase
                .from("receipts")
                .update({
                  description: input.description,
                  amount: input.amount,
                  entry_date: sheetDate,
                  book_date: sheetDate,
                })
                .eq("id", id);
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("receipts").delete().eq("id", id);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
          />
        ) : null}

        {tab === "vouchers" ? (
          <EntriesPanel
            kind="voucher"
            title="Cash voucher"
            bookDate={bookDate}
            dayStatus={day.status}
            dayOpen={dayOpen}
            showApprove={!rangeActive && isBoss && day.status !== "approved"}
            showUnlock={!rangeActive && isBoss && day.status === "approved"}
            showEditWindow
            canUnlockEntry={isBoss && !rangeActive}
            dayActionBusy={busy}
            onApproveDay={approve}
            onUnlockDay={unlock}
            onDateChange={rangeActive ? undefined : onDateChange}
            onUnlockEntry={async (id) => {
              if (!dayOpen) {
                const { error: dayError } = await supabase.rpc("unlock_cash_book_day", {
                  p_date: bookDate,
                });
                if (dayError) throw dayError;
              }
              const { error } = await supabase.rpc("unlock_entry", {
                p_kind: "voucher",
                p_id: id,
              });
              if (error) throw error;
              await refresh(bookDate);
            }}
            rows={vouchers.map((v) => ({
              id: v.id,
              number: v.voucher_number,
              entry_date: v.entry_date,
              description: v.description,
              amount: Number(v.amount),
              editable_until: v.editable_until,
            }))}
            onAdd={async (input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase.from("vouchers").insert({
                book_date: sheetDate,
                entry_date: sheetDate,
                description: input.description,
                amount: input.amount,
                created_by: currentProfile.id,
              });
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onUpdate={async (id, input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase
                .from("vouchers")
                .update({
                  description: input.description,
                  amount: input.amount,
                  entry_date: sheetDate,
                  book_date: sheetDate,
                })
                .eq("id", id);
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("vouchers").delete().eq("id", id);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
          />
        ) : null}

      </div>

      {(tab === "receipts" || tab === "vouchers") ? (
        <div
          className="mt-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"
          style={{ borderColor: "var(--line)", background: "var(--panel)", fontFamily: "var(--font-body)" }}
        >
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Total receipts
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatMoney(
                rangeActive
                  ? receiptTotal
                  : Number(day.opening_balance ?? 0) + receiptTotal,
              )}
            </p>
            {rangeActive ? (
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                Entries in range
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Total vouchers
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatMoney(voucherTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              {rangeActive ? "Net (receipts − vouchers)" : "Closing balance"}
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatMoney(
                rangeActive
                  ? receiptTotal - voucherTotal
                  : Number(day.opening_balance ?? 0) + receiptTotal - voucherTotal,
              )}
            </p>
            {!rangeActive ? (
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                Next day’s opening
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showApproval ? (
        <ApprovalModal
          bookDate={bookDate}
          logs={logs}
          busy={busy}
          onApprove={approve}
          onLater={later}
        />
      ) : null}
    </div>
  );
}
