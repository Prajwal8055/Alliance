# Alliance Square Cash Book

Daily cash book for Alliance Square: **Receipts** (cash in) and **Cash voucher** (cash out), with Boss approval, a 6:30 PM day close, a 10-minute edit window per entry, and a full change log.

## Stack

- Next.js (App Router) → deploy on **Vercel**
- **Supabase** Auth + Postgres + RLS

## Features

- Email/password login for every user
- Roles: `boss` | `accounts` (both can create/edit entries)
- Each calendar day is a new sheet
- Auto unique numbers: `R-YYYY-####` / `V-YYYY-####` (never reused)
- Entries editable for **10 minutes** after create, then locked
- Every insert/update/delete is written to **Changes log**
- At **6:30 PM** (local timezone) the day closes → Waiting for approval
- Boss gets an **Approve / Later** popup with the day’s changes; Approve locks the sheet

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the full script in [`supabase/migrations/001_cash_book.sql`](supabase/migrations/001_cash_book.sql)
3. Paste your **Secret key** into `.env.local` as `SUPABASE_SECRET_KEY`
4. Create / confirm the Boss account:

```bash
npm run ensure-boss
```

Default Boss login: `md@spicetrip.com` (password set via `BOSS_PASSWORD` env or the script default).

5. After Boss signs in, open the **Users** tab to create Accounts users and reset their passwords.

Turn off public sign-ups in Supabase (**Authentication → Providers → Email → Confirm email** / disable open signup) so only Boss can add Accounts users.

## 2. Local app setup

```bash
cp .env.example .env.local
```

Fill from Supabase **API Keys** settings:

| Variable | Where |
|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key (server/Edge only — never commit) |
| `SUPABASE_JWKS_URL` | `https://<project>.supabase.co/auth/v1/.well-known/jwks.json` |

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

This app uses `@supabase/ssr` for the Next.js UI and `@supabase/server` for the Edge Function day-close job.

## 3. Deploy on Vercel

1. Push this repo to GitHub/GitLab
2. Import the project in Vercel
3. Add the same env vars as `.env.example` (include both `SUPABASE_*` and `NEXT_PUBLIC_*` publishable URL/key)
4. Deploy

## 4. 6:30 day-close cron (Supabase Edge Function)

```bash
supabase functions deploy close-day
```

On Edge Functions, `SUPABASE_URL` / keys are injected automatically. Optionally set `CASHBOOK_TIMEZONE`.

Schedule around **18:35** local (Dashboard → Edge Functions → Schedules). The function uses `@supabase/server` with `auth: 'secret'`.

The app also calls `close_cash_book_day_if_due` on load as a backup after 6:30.

## Roles cheat sheet

| Action | Accounts | Boss |
|---|---|---|
| Add / edit / delete within 10 min (day open) | Yes | Yes |
| See Changes log | Yes | Yes |
| Approve / unlock day | No | Yes |
| Edit after day approved | No | Only after Unlock |

## Timezone

Default: `Asia/Kolkata` (Mysore / IST) via `NEXT_PUBLIC_CASHBOOK_TIMEZONE`. Day close is 6:30 PM in that zone.
