import { redirect } from "next/navigation";
import { CashBookApp } from "@/components/cash-book-app";
import { todayBookDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Advance, AuditLog, CashBookDay, Profile, Receipt, Voucher } from "@/lib/types";

type SearchParams = Promise<{ date?: string }>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16" style={{ fontFamily: "var(--font-body)" }}>
        <h1 className="text-2xl font-semibold">Profile missing</h1>
        <p className="mt-2" style={{ color: "var(--ink-muted)" }}>
          Your auth user exists but has no row in <code>profiles</code>. Run the SQL migration
          and ensure the signup trigger created a profile, or insert one manually.
        </p>
      </main>
    );
  }

  // Default today; honor ?date= so Accounts/Boss can browse history (view past/approved sheets).
  const params = await searchParams;
  const today = todayBookDate();
  const SEARCH_MIN = "2026-10-01";
  const requested = typeof params.date === "string" ? params.date.trim() : "";
  const validRequested = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : "";
  const bookDate =
    validRequested && validRequested >= SEARCH_MIN && validRequested <= today
      ? validRequested
      : today;

  const { data: day, error: dayError } = await supabase.rpc("ensure_cash_book_day", {
    p_date: bookDate,
  });

  if (dayError || !day) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16" style={{ fontFamily: "var(--font-body)" }}>
        <h1 className="text-2xl font-semibold">Could not open cash book day</h1>
        <p className="mt-2" style={{ color: "var(--ink-muted)" }}>
          {dayError?.message ?? "Unknown error. Confirm the Supabase migration was applied."}
        </p>
      </main>
    );
  }

  const timezone =
    process.env.NEXT_PUBLIC_CASHBOOK_TIMEZONE ?? "Asia/Kolkata";

  const { data: closed } = await supabase.rpc("close_cash_book_day_if_due", {
    p_date: bookDate,
    p_timezone: timezone,
  });

  const dayRow = (closed as CashBookDay | null) ?? (day as CashBookDay);

  const [{ data: receipts }, { data: vouchers }, { data: advances }, { data: logs }] =
    await Promise.all([
      supabase
        .from("receipts")
        .select("*")
        .eq("book_date", bookDate)
        .order("created_at", { ascending: true }),
      supabase
        .from("vouchers")
        .select("*")
        .eq("book_date", bookDate)
        .order("created_at", { ascending: true }),
      supabase
        .from("advances")
        .select("*")
        .or(`book_date.eq.${bookDate},repaid_date.eq.${bookDate}`)
        .order("sl_no", { ascending: true }),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("book_date", bookDate)
        .order("created_at", { ascending: false }),
    ]);

  return (
    <CashBookApp
      initialDate={bookDate}
      profile={profile as Profile}
      initialDay={dayRow}
      initialReceipts={(receipts as Receipt[]) ?? []}
      initialVouchers={(vouchers as Voucher[]) ?? []}
      initialAdvances={(advances as Advance[]) ?? []}
      initialLogs={(logs as AuditLog[]) ?? []}
    />
  );
}
