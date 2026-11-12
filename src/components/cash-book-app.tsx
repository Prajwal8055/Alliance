"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityLog } from "@/components/activity-log";
import { ApprovalModal } from "@/components/approval-modal";
import { EntriesPanel } from "@/components/entries-panel";
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

type Tab = "receipts" | "vouchers" | "activity" | "users";

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
  const [tab, setTab] = useState<Tab>("receipts");
  const [showApproval, setShowApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isBoss = profile.role === "boss";
  const isToday = bookDate === todayBookDate();
  const dayOpen = day.status === "open";
  const timezone =
    process.env.NEXT_PUBLIC_CASHBOOK_TIMEZONE ?? "America/Los_Angeles";

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

      const dayRow = (closedDay as CashBookDay | null) ?? (dayFallback as CashBookDay | null);
      if (dayRow) setDay(dayRow);
      setReceipts((receiptRows as Receipt[]) ?? []);
      setVouchers((voucherRows as Voucher[]) ?? []);
      setLogs((logRows as AuditLog[]) ?? []);
    },
    [supabase, timezone],
  );

  useEffect(() => {
    setBookDate(initialDate);
    setDay(initialDay);
    setReceipts(initialReceipts);
    setVouchers(initialVouchers);
    setLogs(initialLogs);
  }, [initialDate, initialDay, initialReceipts, initialVouchers, initialLogs]);

  useEffect(() => {
    if (!isBoss || !isToday) {
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
  }, [isBoss, isToday, bookDate, day.status]);

  async function onDateChange(next: string) {
    setBookDate(next);
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
          >
            Alliance Square
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Cash Book</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
            Signed in as {profile.full_name || "User"} · {profile.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: "var(--font-body)" }}>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Sheet date
            <input
              type="date"
              value={bookDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            />
          </label>
          <StatusBadge status={day.status} />
          {isBoss && day.status !== "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={approve}
              className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Approve
            </button>
          ) : null}
          {isBoss && day.status === "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={unlock}
              className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            >
              Unlock
            </button>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div
        className="mt-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"
        style={{ borderColor: "var(--line)", background: "var(--panel)", fontFamily: "var(--font-body)" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Receipts in
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatMoney(receiptTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Vouchers out
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatMoney(voucherTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Net
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatMoney(receiptTotal - voucherTotal)}
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-4 text-sm" style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>
          {message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2" style={{ fontFamily: "var(--font-body)" }}>
        {(
          [
            ["receipts", "Receipts"],
            ["vouchers", "Cash voucher"],
            ["activity", "Changes log"],
            ...(isBoss ? ([["users", "Users"]] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="rounded-full px-4 py-2 text-sm font-semibold transition"
            style={{
              background: tab === id ? "var(--accent)" : "var(--panel)",
              color: tab === id ? "#fff" : "var(--ink)",
              border: `1px solid ${tab === id ? "var(--accent)" : "var(--line)"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border p-5 shadow-[var(--shadow)]" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
        {tab === "receipts" ? (
          <EntriesPanel
            kind="receipt"
            title="Receipts"
            bookDate={bookDate}
            dayStatus={day.status}
            dayOpen={dayOpen}
            rows={receipts.map((r) => ({
              id: r.id,
              number: r.receipt_number,
              entry_date: r.entry_date,
              description: r.description,
              amount: Number(r.amount),
              editable_until: r.editable_until,
            }))}
            onAdd={async (input) => {
              const { error } = await supabase.from("receipts").insert({
                book_date: bookDate,
                entry_date: input.entry_date || bookDate,
                description: input.description,
                amount: input.amount,
                created_by: profile.id,
              });
              if (error) throw error;
              await refresh(bookDate);
            }}
            onUpdate={async (id, input) => {
              const { error } = await supabase
                .from("receipts")
                .update({
                  description: input.description,
                  amount: input.amount,
                  entry_date: input.entry_date,
                })
                .eq("id", id);
              if (error) throw error;
              await refresh(bookDate);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("receipts").delete().eq("id", id);
              if (error) throw error;
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
            rows={vouchers.map((v) => ({
              id: v.id,
              number: v.voucher_number,
              entry_date: v.entry_date,
              description: v.description,
              amount: Number(v.amount),
              editable_until: v.editable_until,
            }))}
            onAdd={async (input) => {
              const { error } = await supabase.from("vouchers").insert({
                book_date: bookDate,
                entry_date: input.entry_date || bookDate,
                description: input.description,
                amount: input.amount,
                created_by: profile.id,
              });
              if (error) throw error;
              await refresh(bookDate);
            }}
            onUpdate={async (id, input) => {
              const { error } = await supabase
                .from("vouchers")
                .update({
                  description: input.description,
                  amount: input.amount,
                  entry_date: input.entry_date,
                })
                .eq("id", id);
              if (error) throw error;
              await refresh(bookDate);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("vouchers").delete().eq("id", id);
              if (error) throw error;
              await refresh(bookDate);
            }}
          />
        ) : null}

        {tab === "activity" ? (
          <section>
            <h2 className="mb-2 text-2xl font-semibold">Changes log</h2>
            <p className="mb-4 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
              Every create, edit, and delete by Boss or Accounts is recorded for this day.
            </p>
            <ActivityLog logs={logs} />
          </section>
        ) : null}

        {tab === "users" && isBoss ? <UsersPanel /> : null}
      </div>

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
