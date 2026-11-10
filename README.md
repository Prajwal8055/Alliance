# Alliance Square: Verified Advisor Cards

Each salesperson gets a live, verifiable digital identity card at `/advisor/<name>` with a QR code.
Customers see a live "Verified" status, deals closed, verified-customer reviews and a WhatsApp button.
When someone leaves, deactivate the card and every old QR code shows "No longer with Alliance Square".

| Who | Can do |
|---|---|
| Public | View cards, verify a phone number on `/`, leave a review **only** via a one-time link |
| Salesperson | `/me`: own card, QR, reviews, private stats (leads, conversion) |
| Manager | `/admin`: create and edit cards, update numbers, upload photos, send review links, deactivate |
| Admin | Everything, plus hide abusive reviews and manage team access (`/admin/team`) |

Lead counts and conversion rates are never shown publicly. Access rules are enforced in the database
(Postgres row-level security), not just in the UI.

## Setup (about 20 minutes)

1. **Supabase**: create a project (region: Mumbai). In **SQL Editor**, run in order
   `supabase/migrations/0001_advisor_cards.sql`, `supabase/migrations/0002_photo_storage.sql`, then `supabase/seed.sql`.
2. **Auth settings** (Authentication):
   - Sign In / Providers → Email: **turn off "Allow new users to sign up"**. Only invited staff can log in.
   - URL Configuration → Site URL: your card domain, e.g. `https://team.alliancesquare.com`.
   - Email Templates → **Magic Link**: set the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
     (and the same with `type=invite` in the **Invite user** template).
3. **Vercel**: import this repo, add the three variables from `.env.example`, deploy.
   Point a subdomain such as `team.alliancesquare.com` at it (Vercel → Domains).
4. **First admin**: Authentication → Users → Invite user (your email). Then run the commented
   `insert into public.profiles …` line in `supabase/seed.sql` with your email. Log in at `/login`.
5. Invite the other staff the same way, then give them access at `/admin/team`.

Never put the Supabase `service_role` key in this app; it doesn't need it.

## Daily use

- **New salesperson**: Admin → New advisor → upload photo → download the QR for visiting cards.
- **After a booking or site visit**: open the advisor → "Ask a customer for a review" → Send on WhatsApp.
- **Someone leaves**: open the advisor → Deactivate card. Also remove their access in Team access.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
npm test          # unit tests (phone numbers, slugs, image checks, redirects)
npm run test:db   # database security tests against a throwaway local Postgres 16
npm run typecheck
```

Database schema is plain Postgres apart from Supabase auth (`auth.uid()`, `auth.users`), so moving to AWS RDS later
only needs an auth replacement for those two.
