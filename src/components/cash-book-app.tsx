"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountMenu, type AppNotification } from "@/components/account-menu";
import { ActivityLog } from "@/components/activity-log";
import { AdvancesPanel } from "@/components/advances-panel";
import { ApprovalModal } from "@/components/approval-modal";
import { EntriesPanel } from "@/components/entries-panel";
import { NoticeModal } from "@/components/notice-modal";
import { ProfilePanel } from "@/components/profile-panel";
import { StatementPanel } from "@/components/statement-panel";
import { UsersPanel } from "@/components/users-panel";
import {
  formatDisplayDate,
  formatMoney,
  isPastCloseTime,
  todayBookDate,
} from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type {
  Advance,
  AuditLog,
  CashBookDay,
  Profile,
  Receipt,
  Voucher,
} from "@/lib/types";

type Tab =
  | "statement"
  | "receipts"
  | "vouchers"
  | "advances"
  | "activity"
  | "users"
  | "profile";

type Props = {
  initialDate: string;
  profile: Profile;
  initialDay: CashBookDay;
  initialReceipts: Receipt[];
  initialVouchers: Voucher[];
  initialAdvances: Advance[];
  initialLogs: AuditLog[];
};

function laterKey(date: string) {
  return `cashbook-later-${date}`;
}

function lowBalanceKey(date: string) {
  return `cashbook-low-balance-${date}`;
}

function approvedNoticeKey(date: string) {
  return `cashbook-approved-notice-${date}`;
}

/** Earliest date Advances From/To may search (01-10-2026). */
const ADVANCE_SEARCH_MIN = "2026-10-01";

export function CashBookApp({
  initialDate,
  profile,
  initialDay,
  initialReceipts,
  initialVouchers,
  initialAdvances,
  initialLogs,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [bookDate, setBookDate] = useState(() => todayBookDate());
  const [day, setDay] = useState(initialDay);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [vouchers, setVouchers] = useState(initialVouchers);
  const [advances, setAdvances] = useState(initialAdvances);
  /** Full Advances-tab browse list (From min … To); independent of day sheet. */
  const [browseAdvances, setBrowseAdvances] = useState<Advance[]>(initialAdvances);
  /** Longer lookback for Cash Flow weekly/monthly chart. */
  const [chartReceipts, setChartReceipts] = useState<Receipt[]>(initialReceipts);
  const [chartVouchers, setChartVouchers] = useState<Voucher[]>(initialVouchers);
  const [chartAdvances, setChartAdvances] = useState<Advance[]>(initialAdvances);
  const [activeAdvanceNames, setActiveAdvanceNames] = useState<
    { kind: string; person_name: string }[]
  >([]);
  const [recoverableAdvances, setRecoverableAdvances] = useState<Advance[]>([]);
  const [logs, setLogs] = useState(initialLogs);
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [tab, setTab] = useState<Tab>(() =>
    profile.role === "boss" ? "statement" : profile.role === "hr" ? "advances" : "receipts",
  );
  const [showApproval, setShowApproval] = useState(false);
  const [showLowBalance, setShowLowBalance] = useState(false);
  const [showApprovedNotice, setShowApprovedNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(() => todayBookDate());
  const [rangeTo, setRangeTo] = useState(() => todayBookDate());
  const [rangeActive, setRangeActive] = useState(false);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const isBoss = currentProfile.role === "boss";
  const isHr = currentProfile.role === "hr";
  const isAccounts = currentProfile.role === "accounts";
  const today = todayBookDate();
  const isToday = bookDate === today;
  // Accounts may only add/edit on the current cash-book day; Boss/HR can work any open day.
  const dayOpen =
    day.status === "open" && !rangeActive && (isBoss || isHr || isToday);
  const timezone =
    process.env.NEXT_PUBLIC_CASHBOOK_TIMEZONE ?? "America/Los_Angeles";

  function nameFor(userId: string | null | undefined) {
    if (!userId) return "—";
    if (profileNames[userId]?.trim()) return profileNames[userId].trim();
    if (userId === currentProfile.id) {
      return currentProfile.full_name?.trim() || "User";
    }
    return "User";
  }

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, full_name");
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.id] = row.full_name?.trim() || "User";
    }
    setProfileNames(map);
  }, [supabase]);

  const loadActiveAdvanceNames = useCallback(async () => {
    const [{ data: activeRows }, { data: approvedRows }] = await Promise.all([
      supabase
        .from("advances")
        .select("kind, person_name")
        .in("status", ["pending", "approved"]),
      supabase.from("advances").select("*").eq("status", "approved"),
    ]);
    setActiveAdvanceNames(
      ((activeRows as { kind: string; person_name: string }[]) ?? []).map((row) => ({
        kind: row.kind || "salary",
        person_name: row.person_name,
      })),
    );
    setRecoverableAdvances((approvedRows as Advance[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void loadActiveAdvanceNames();
  }, [loadActiveAdvanceNames, advances]);

  const loadDay = useCallback(
    async (date: string, closedDay?: CashBookDay | null) => {
      const [
        { data: dayFallback },
        { data: receiptRows },
        { data: voucherRows },
        { data: advanceRows },
        { data: logRows },
      ] = await Promise.all([
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
          .from("advances")
          .select("*")
          .or(`book_date.eq.${date},repaid_date.eq.${date}`)
          .order("sl_no", { ascending: true }),
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
      setAdvances((advanceRows as Advance[]) ?? []);
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
    setRangeFrom(initialDate);
    setRangeTo(initialDate);
    setRangeActive(false);
    setDay(initialDay);
    setReceipts(initialReceipts);
    setVouchers(initialVouchers);
    setAdvances(initialAdvances);
    setLogs(initialLogs);
  }, [initialDate, initialDay, initialReceipts, initialVouchers, initialAdvances, initialLogs]);

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
          table: "advances",
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

  // Accounts: only today's sheet (no back/forward dates).
  useEffect(() => {
    if (isBoss || isHr) return;
    if (bookDate === today && !rangeActive) return;
    void onDateChange(today);
  }, [isBoss, isHr, today, bookDate, rangeActive]);

  // Boss uses combined statement; HR lands on Advances; Accounts never stays on Advances/statement.
  useEffect(() => {
    if (isBoss && (tab === "receipts" || tab === "vouchers")) {
      setTab("statement");
    } else if (isHr && (tab === "receipts" || tab === "vouchers" || tab === "statement")) {
      setTab("advances");
    } else if (isAccounts && (tab === "advances" || tab === "statement")) {
      setTab("receipts");
    }
  }, [isHr, isAccounts, tab]);

  async function applyDateRange() {
    if (!isBoss && !isHr) {
      await onDateChange(today);
      return;
    }
    if (!rangeFrom || !rangeTo) {
      setMessage("Choose From and To dates");
      return;
    }
    if (rangeFrom > rangeTo) {
      setMessage("From date must be on or before To date");
      return;
    }

    // Same day → normal editable sheet
    if (rangeFrom === rangeTo) {
      await onDateChange(rangeFrom);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await supabase.rpc("ensure_cash_book_day", { p_date: rangeFrom });
      const [
        { data: fromDay },
        { data: receiptRows },
        { data: voucherRows },
        { data: advanceRows },
        { data: logRows },
      ] = await Promise.all([
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
          .from("advances")
          .select("*")
          .gte("book_date", rangeFrom)
          .lte("book_date", rangeTo)
          .order("sl_no", { ascending: true }),
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
      setAdvances((advanceRows as Advance[]) ?? []);
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
    const sheetDate = isBoss ? entryDate || bookDate : today;
    if (!isBoss && entryDate && entryDate !== today) {
      throw new Error("Only Boss can enter entries for other dates");
    }
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
  const advanceOutTotal = advances
    .filter((a) => {
      if (a.status !== "approved" && a.status !== "repaid") return false;
      return rangeActive || a.book_date === bookDate;
    })
    .reduce((s, a) => s + Number(a.amount), 0);
  const advanceRepaidToday = advances
    .filter(
      (a) =>
        a.status === "repaid" &&
        a.repaid_date === bookDate &&
        !a.repaid_via_receipt,
    )
    .reduce((s, a) => s + Number(a.amount), 0);
  const advancesForPanel = advances.filter((a) => a.book_date === bookDate);
  const advancesForTab = tab === "advances" ? browseAdvances : advancesForPanel;
  const salaryAdvances = advancesForTab.filter(
    (a) => (a.kind ?? "salary") === "salary",
  );
  const commissionAdvances = advancesForTab.filter(
    (a) => a.kind === "commission",
  );
  const advanceKnownNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of [...advances, ...browseAdvances]) {
      const n = a.person_name?.trim();
      if (n) names.add(n);
    }
    for (const a of activeAdvanceNames) {
      const n = a.person_name?.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [advances, browseAdvances, activeAdvanceNames]);

  const loadBrowseAdvances = useCallback(
    async (from: string, to: string) => {
      const fromDate = from < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : from;
      const toDate = to < fromDate ? fromDate : to;
      const { data, error } = await supabase
        .from("advances")
        .select("*")
        .gte("book_date", fromDate)
        .lte("book_date", toDate)
        .order("book_date", { ascending: true })
        .order("sl_no", { ascending: true });
      if (error) throw error;
      setBrowseAdvances((data as Advance[]) ?? []);
    },
    [supabase],
  );

  const loadChartHistory = useCallback(async () => {
    const from = ADVANCE_SEARCH_MIN;
    const to = todayBookDate();
    const [{ data: r }, { data: v }, { data: a }] = await Promise.all([
      supabase
        .from("receipts")
        .select("*")
        .gte("book_date", from)
        .lte("book_date", to)
        .order("book_date", { ascending: true }),
      supabase
        .from("vouchers")
        .select("*")
        .gte("book_date", from)
        .lte("book_date", to)
        .order("book_date", { ascending: true }),
      supabase
        .from("advances")
        .select("*")
        .gte("book_date", from)
        .lte("book_date", to)
        .order("book_date", { ascending: true }),
    ]);
    setChartReceipts((r as Receipt[]) ?? []);
    setChartVouchers((v as Voucher[]) ?? []);
    setChartAdvances((a as Advance[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!isBoss) return;
    void loadChartHistory().catch(() => {
      /* keep prior series */
    });
  }, [isBoss, loadChartHistory, bookDate, receipts, vouchers, advances]);

  useEffect(() => {
    if (tab === "advances") {
      setRangeFrom(ADVANCE_SEARCH_MIN);
      setRangeTo(today);
      void loadBrowseAdvances(ADVANCE_SEARCH_MIN, today).catch(() => {
        /* keep prior list */
      });
      return;
    }
    // Leaving Advances: restore day range so Cash Book filters stay on the sheet date.
    if (!rangeActive) {
      setRangeFrom(bookDate);
      setRangeTo(bookDate);
    }
  }, [tab, loadBrowseAdvances, today, bookDate, rangeActive]);

  function blockedNamesForKind(kind: "salary" | "commission") {
    return activeAdvanceNames
      .filter((a) => (a.kind || "salary") === kind)
      .map((a) => a.person_name.trim())
      .filter(Boolean);
  }
  const closingBalance = rangeActive
    ? receiptTotal - voucherTotal - advanceOutTotal + advanceRepaidToday
    : Number(day.opening_balance ?? 0) +
      receiptTotal -
      voucherTotal -
      advanceOutTotal +
      advanceRepaidToday;
  const isProfileView = tab === "profile";
  const isUsersView = tab === "users" && isBoss;
  const isActivityView = tab === "activity";

  useEffect(() => {
    if (!isBoss || rangeActive || showApproval) {
      setShowLowBalance(false);
      return;
    }
    if (closingBalance >= 5000) {
      setShowLowBalance(false);
      return;
    }
    const dismissed =
      typeof window !== "undefined" &&
      sessionStorage.getItem(lowBalanceKey(bookDate)) === "1";
    setShowLowBalance(!dismissed);
  }, [isBoss, rangeActive, showApproval, closingBalance, bookDate]);

  useEffect(() => {
    if (isBoss || rangeActive || showApproval) {
      setShowApprovedNotice(false);
      return;
    }
    if (day.status !== "approved") {
      setShowApprovedNotice(false);
      return;
    }
    const dismissed =
      typeof window !== "undefined" &&
      sessionStorage.getItem(approvedNoticeKey(bookDate)) === "1";
    setShowApprovedNotice(!dismissed);
  }, [isBoss, rangeActive, showApproval, day.status, bookDate]);

  if (isProfileView || isUsersView || isActivityView) {
    return (
      <div
        className={`mx-auto flex w-full flex-1 flex-col px-4 py-8 ${
          isProfileView ? "max-w-2xl" : "max-w-6xl"
        }`}
      >
        <button
          type="button"
          onClick={() => setTab(isBoss ? "statement" : "receipts")}
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
            onProfileUpdated={(next) => {
              setCurrentProfile(next);
              setProfileNames((prev) => ({
                ...prev,
                [next.id]: next.full_name?.trim() || "User",
              }));
            }}
            onDataWiped={async () => {
              setTab(isBoss ? "statement" : "receipts");
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

  const navTabs = (
    [
      ...(isBoss
        ? ([["statement", "Cash Book"] as const] as const)
        : !isHr
          ? ([
              ["receipts", "Receipts"] as const,
              ["vouchers", "Cash voucher"] as const,
            ] as const)
          : []),
      ...(isHr || isBoss ? ([["advances", "Advances"] as const] as const) : []),
    ] as const
  );

  const pendingAdvances = useMemo(
    () =>
      (tab === "advances" ? browseAdvances : advances).filter((a) => a.status === "pending"),
    [tab, browseAdvances, advances],
  );

  const notifications = useMemo((): AppNotification[] => {
    const items: AppNotification[] = [];
    if (day.status === "pending_approval" && isBoss) {
      items.push({
        id: "day-pending",
        title: "Day awaiting approval",
        body: `${formatDisplayDate(bookDate)} is ready for Boss approval.`,
        tone: "warn",
        onClick: () => setTab(isBoss ? "statement" : "receipts"),
      });
    }
    if (day.status === "approved") {
      items.push({
        id: "day-locked",
        title: "Sheet approved",
        body: `${formatDisplayDate(bookDate)} is locked. Hold Unlock day to reopen.`,
        tone: "info",
        onClick: () => setTab(isBoss ? "statement" : "receipts"),
      });
    }
    if (!rangeActive && closingBalance < 5000) {
      items.push({
        id: "low-cash",
        title: "Low closing balance",
        body: `Cash is ${formatMoney(closingBalance)} (below ₹5,000).`,
        tone: "danger",
        onClick: () => setTab(isBoss ? "statement" : "receipts"),
      });
    }
    if ((isBoss || isHr) && pendingAdvances.length > 0) {
      items.push({
        id: "adv-pending",
        title: `${pendingAdvances.length} advance${pendingAdvances.length === 1 ? "" : "s"} pending`,
        body: "Open Advances to review and approve.",
        tone: "warn",
        onClick: () => setTab("advances"),
      });
    }
    return items;
  }, [
    day.status,
    bookDate,
    rangeActive,
    closingBalance,
    pendingAdvances.length,
    isBoss,
    isHr,
  ]);

  return (
    <div className="flex w-full flex-1 flex-col">
      <div
        className="flex h-16 items-center justify-end gap-3 border-b px-4 sm:px-6"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <AccountMenu
          profile={currentProfile}
          isBoss={isBoss}
          notifications={notifications}
          onOpenProfile={() => setTab("profile")}
          onOpenActivity={() => setTab("activity")}
          onOpenUsers={() => setTab("users")}
          onSignOut={signOut}
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              Cash Book
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-muted)" }}>
              Receipts and vouchers together like a bank statement.
            </p>
          </div>
          {navTabs.length > 0 ? (
            <div
              className="inline-flex rounded-xl border p-1"
              style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
            >
              {navTabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold transition"
                  style={{
                    background: tab === id ? "var(--accent)" : "transparent",
                    color: tab === id ? "#fff" : "var(--ink)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {message ? (
          <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
            {message}
          </p>
        ) : null}

        {rangeActive ? (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-muted)" }}>
            Showing {rangeFrom} to {rangeTo} (view only). Set From and To to the same day (or Clear) to
            edit.
          </p>
        ) : null}

        {tab === "statement" && isBoss ? (
          <div className="mt-5">
            <StatementPanel
            bookDate={bookDate}
            dayStatus={day.status}
            openingBalance={Number(day.opening_balance ?? 0)}
            receipts={receipts}
            vouchers={vouchers}
            advances={rangeActive ? advances : advancesForPanel}
            chartReceipts={rangeActive ? receipts : chartReceipts}
            chartVouchers={rangeActive ? vouchers : chartVouchers}
            chartAdvances={rangeActive ? advances : chartAdvances}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            rangeActive={rangeActive}
            dayActionBusy={busy}
            showApprove={!rangeActive && day.status !== "approved"}
            showUnlock={!rangeActive && day.status === "approved"}
            canExport={isBoss}
            canChangeEntryDate={isBoss}
            onApproveDay={approve}
            onUnlockDay={unlock}
            onRangeFromChange={(date) => {
              setRangeFrom(date);
              setRangeTo(date);
            }}
            onRangeToChange={(date) => {
              setRangeTo(date < rangeFrom ? rangeFrom : date);
            }}
            onApplyRange={() => void applyDateRange()}
            onClearRange={() => void clearDateRange()}
            onUpdateOpeningBalance={async (amount) => {
              const { error } = await supabase
                .from("cash_book_days")
                .update({ opening_balance: amount })
                .eq("book_date", bookDate);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
            onAddReceipt={async (input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase.from("receipts").insert({
                book_date: sheetDate,
                entry_date: sheetDate,
                description: input.description,
                remarks: input.remarks,
                amount: input.amount,
                created_by: currentProfile.id,
              });
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onAddVoucher={async (input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase.from("vouchers").insert({
                book_date: sheetDate,
                entry_date: sheetDate,
                description: input.description,
                remarks: input.remarks,
                amount: input.amount,
                created_by: currentProfile.id,
              });
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onUpdateReceipt={async (id, input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase
                .from("receipts")
                .update({
                  description: input.description,
                  remarks: input.remarks,
                  amount: input.amount,
                  entry_date: sheetDate,
                  book_date: sheetDate,
                })
                .eq("id", id);
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onUpdateVoucher={async (id, input) => {
              const sheetDate = await placeOnSheet(input.entry_date || bookDate);
              const { error } = await supabase
                .from("vouchers")
                .update({
                  description: input.description,
                  remarks: input.remarks,
                  amount: input.amount,
                  entry_date: sheetDate,
                  book_date: sheetDate,
                })
                .eq("id", id);
              if (error) throw error;
              await afterEntrySaved(sheetDate);
            }}
            onDeleteReceipt={async (id) => {
              const { error } = await supabase.from("receipts").delete().eq("id", id);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
            onDeleteVoucher={async (id) => {
              const { error } = await supabase.from("vouchers").delete().eq("id", id);
              if (error) throw error;
              await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
              await refresh(bookDate);
            }}
          />
        </div>
      ) : null}

      {(tab === "receipts" || tab === "vouchers") ? (
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
            alwaysEditable={isBoss && !rangeActive}
            canUnlockEntry={isBoss && !rangeActive}
            dayActionBusy={busy}
            onApproveDay={approve}
            onUnlockDay={unlock}
            rangeFrom={isAccounts ? today : rangeFrom}
            rangeTo={isAccounts ? today : rangeTo}
            rangeActive={rangeActive}
            dateRangeLocked={isAccounts}
            lockedEntryDate={isBoss ? undefined : today}
            onRangeFromChange={(date) => {
              setRangeFrom(date);
              setRangeTo(date);
            }}
            onRangeToChange={(date) => {
              setRangeTo(date < rangeFrom ? rangeFrom : date);
            }}
            onApplyRange={() => void applyDateRange()}
            onClearRange={() => void clearDateRange()}
            recoverableAdvances={recoverableAdvances}
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
              created_by_name: nameFor(r.created_by),
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
              if (input.advance_id) {
                const { error: advError } = await supabase.rpc("apply_receipt_to_advance", {
                  p_advance_id: input.advance_id,
                  p_amount: input.amount,
                  p_date: sheetDate,
                });
                if (advError) throw advError;
                await loadActiveAdvanceNames();
              }
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
            alwaysEditable={isBoss && !rangeActive}
            canUnlockEntry={isBoss && !rangeActive}
            dayActionBusy={busy}
            onApproveDay={approve}
            onUnlockDay={unlock}
            rangeFrom={isAccounts ? today : rangeFrom}
            rangeTo={isAccounts ? today : rangeTo}
            rangeActive={rangeActive}
            dateRangeLocked={isAccounts}
            lockedEntryDate={isBoss ? undefined : today}
            onRangeFromChange={(date) => {
              setRangeFrom(date);
              setRangeTo(date);
            }}
            onRangeToChange={(date) => {
              setRangeTo(date < rangeFrom ? rangeFrom : date);
            }}
            onApplyRange={() => void applyDateRange()}
            onClearRange={() => void clearDateRange()}
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
              created_by_name: nameFor(v.created_by),
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
      ) : null}

      {tab === "advances" ? (
        <>
          <div
            className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border px-3 py-2"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              From
              <input
                type="date"
                value={rangeFrom}
                min={ADVANCE_SEARCH_MIN}
                onChange={(e) => {
                  const date =
                    e.target.value < ADVANCE_SEARCH_MIN
                      ? ADVANCE_SEARCH_MIN
                      : e.target.value;
                  setRangeFrom(date);
                  setRangeTo(date < rangeTo ? rangeTo : date);
                }}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              To
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom}
                onChange={(e) => {
                  const date = e.target.value;
                  setRangeTo(date < rangeFrom ? rangeFrom : date);
                }}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setMessage(null);
                  try {
                    const from =
                      rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom;
                    const to = rangeTo < from ? from : rangeTo;
                    setRangeFrom(from);
                    setRangeTo(to);
                    await loadBrowseAdvances(from, to);
                  } catch (err) {
                    setMessage(
                      err instanceof Error ? err.message : "Failed to load advances",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Apply
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRangeFrom(ADVANCE_SEARCH_MIN);
                setRangeTo(today);
                void (async () => {
                  setBusy(true);
                  try {
                    await loadBrowseAdvances(ADVANCE_SEARCH_MIN, today);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "#fff" }}
            >
              Show all
            </button>
          </div>
          {(
            [
              ["salary", "Salary advance", salaryAdvances] as const,
              ["commission", "Commission advance", commissionAdvances] as const,
            ]
          ).map(([kind, title, rows]) => (
            <div
              key={kind}
              className="mt-6 rounded-2xl border p-5 shadow-[var(--shadow)]"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <AdvancesPanel
                title={title}
                rows={rows}
                blockedNames={blockedNamesForKind(kind)}
                knownNames={advanceKnownNames}
                bookDate={bookDate}
                canCreate={dayOpen || ((isHr || isBoss) && !rangeActive)}
                isBoss={isHr || isBoss}
                busy={busy}
                onAdd={async (input) => {
                  const sheetDate = await placeOnSheet(input.entry_date || bookDate);
                  const { error } = await supabase.from("advances").insert({
                    book_date: sheetDate,
                    entry_date: sheetDate,
                    kind,
                    person_name: input.person_name,
                    amount: input.amount,
                    created_by: currentProfile.id,
                    status: "pending",
                  });
                  if (error) throw error;
                  await afterEntrySaved(sheetDate);
                  await loadActiveAdvanceNames();
                  await loadBrowseAdvances(
                    rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom,
                    rangeTo,
                  );
                }}
                onApprove={async (id) => {
                  const { error } = await supabase.rpc("approve_advance", { p_id: id });
                  if (error) throw error;
                  await refresh(bookDate);
                  await loadActiveAdvanceNames();
                  await loadBrowseAdvances(
                    rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom,
                    rangeTo,
                  );
                }}
                onRepay={async (id) => {
                  const { error } = await supabase.rpc("repay_advance", {
                    p_id: id,
                    p_date: isHr || isBoss ? bookDate : today,
                  });
                  if (error) throw error;
                  await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
                  await refresh(bookDate);
                  await loadActiveAdvanceNames();
                  await loadBrowseAdvances(
                    rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom,
                    rangeTo,
                  );
                }}
                onDelete={async (id) => {
                  const { error } = await supabase.from("advances").delete().eq("id", id);
                  if (error) throw error;
                  await supabase.rpc("recompute_opening_balances_from", { p_from: bookDate });
                  await refresh(bookDate);
                  await loadActiveAdvanceNames();
                  await loadBrowseAdvances(
                    rangeFrom < ADVANCE_SEARCH_MIN ? ADVANCE_SEARCH_MIN : rangeFrom,
                    rangeTo,
                  );
                }}
              />
            </div>
          ))}
        </>
      ) : null}

      {(tab === "receipts" || tab === "vouchers" || tab === "advances") ? (
        <div
          className="mt-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-4"
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
              Advances out
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--danger)" }}>
              {formatMoney(advanceOutTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              {rangeActive ? "Net" : "Closing balance"}
            </p>
            <p
              className="mt-1 text-2xl font-semibold"
              style={{
                fontFamily: "var(--font-display)",
                color: closingBalance < 5000 ? "var(--danger)" : undefined,
              }}
            >
              {formatMoney(closingBalance)}
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

      {showLowBalance ? (
        <NoticeModal
          tone="warn"
          eyebrow="Low cash"
          title="Closing balance below ₹5,000"
          body={`Closing balance is ${formatMoney(closingBalance)} for ${formatDisplayDate(bookDate)}. Review vouchers or add receipts before the balance runs too low.`}
          confirmLabel="Got it"
          onDismiss={() => {
            sessionStorage.setItem(lowBalanceKey(bookDate), "1");
            setShowLowBalance(false);
          }}
        />
      ) : null}

      {showApprovedNotice ? (
        <NoticeModal
          tone="info"
          eyebrow="Day locked"
          title={`Sheet approved for ${formatDisplayDate(bookDate)}`}
          body="Boss has approved and locked this cash book day. You can view entries, but new edits are closed."
          confirmLabel="OK"
          onDismiss={() => {
            sessionStorage.setItem(approvedNoticeKey(bookDate), "1");
            setShowApprovedNotice(false);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
