import { NextResponse } from "next/server";
import { requireBoss } from "@/lib/auth/require-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function wipeViaTables(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{
  receipts: number;
  vouchers: number;
  audit_logs: number;
  cash_book_days: number;
}> {
  const [{ count: receiptCount }, { count: voucherCount }, { count: logCount }, { count: dayCount }] =
    await Promise.all([
      admin.from("receipts").select("*", { count: "exact", head: true }),
      admin.from("vouchers").select("*", { count: "exact", head: true }),
      admin.from("audit_logs").select("*", { count: "exact", head: true }),
      admin.from("cash_book_days").select("*", { count: "exact", head: true }),
    ]);

  const { error: receiptError } = await admin
    .from("receipts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (receiptError) throw new Error(receiptError.message);

  const { error: voucherError } = await admin
    .from("vouchers")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (voucherError) throw new Error(voucherError.message);

  const { error: logError } = await admin
    .from("audit_logs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (logError) throw new Error(logError.message);

  const { error: dayError } = await admin
    .from("cash_book_days")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (dayError) throw new Error(dayError.message);

  return {
    receipts: receiptCount ?? 0,
    vouchers: voucherCount ?? 0,
    audit_logs: logCount ?? 0,
    cash_book_days: dayCount ?? 0,
  };
}

export async function POST() {
  const gate = await requireBoss();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("wipe_all_cash_book_data");

    if (!error) {
      return NextResponse.json({ ok: true, wiped: data });
    }

    const missingFn =
      error.code === "PGRST202" ||
      /wipe_all_cash_book_data|Could not find the function/i.test(error.message);

    if (!missingFn) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const admin = createAdminClient();
    const wiped = await wipeViaTables(admin);
    return NextResponse.json({ ok: true, wiped, via: "tables" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wipe failed" },
      { status: 500 },
    );
  }
}
