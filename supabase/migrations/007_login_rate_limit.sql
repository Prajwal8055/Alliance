-- Login brute-force protection: 5 failed attempts → 1 hour lockout
-- Passwords themselves are hashed+salted by Supabase Auth (bcrypt); never store plaintext.
-- Safe to re-run.

create table if not exists public.login_attempts (
  email text primary key,
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

-- No policies for authenticated/anon: only service role (admin API) can read/write.
drop policy if exists "login_attempts_deny_all" on public.login_attempts;

comment on table public.login_attempts is
  'Tracks failed sign-in attempts per email. Managed only by server with secret key.';
