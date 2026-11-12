// Deploy: supabase functions deploy close-day
// Schedule ~18:35 local. On Edge Functions, Supabase injects URL/keys automatically.
// Optional: set CLOSE_DAY_SECRET and send Authorization: Bearer <secret>

import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const timezone = Deno.env.get("CASHBOOK_TIMEZONE") ?? "America/Los_Angeles";

    const todayLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data, error } = await ctx.supabaseAdmin.rpc("close_cash_book_day", {
      p_date: todayLocal,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, book_date: todayLocal, closed: data });
  }),
};
