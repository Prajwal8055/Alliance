-- User-added UK Square bookings (static seed remains in app code).
-- Safe to re-run.

create table if not exists public.uk_square_bookings (
  id uuid primary key default gen_random_uuid(),
  sl_no integer not null,
  dob text not null default '',
  client_name text not null,
  site_no text not null default '',
  price numeric(14, 2),
  sqft numeric(14, 2),
  facing text not null default '',
  realtors text not null default '',
  to_as_booking numeric(14, 2),
  others numeric(14, 2),
  mr_d_kantha numeric(14, 2),
  total numeric(14, 2),
  d_kantha numeric(14, 2),
  bsp numeric(14, 2),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists uk_square_bookings_sl_no_idx
  on public.uk_square_bookings (sl_no);

alter table public.uk_square_bookings enable row level security;

drop policy if exists "uk_square_select_authenticated" on public.uk_square_bookings;
create policy "uk_square_select_authenticated"
  on public.uk_square_bookings for select to authenticated
  using (true);

drop policy if exists "uk_square_insert_accounts_boss" on public.uk_square_bookings;
create policy "uk_square_insert_accounts_boss"
  on public.uk_square_bookings for insert to authenticated
  with check (public.is_accounts() or public.is_boss());

drop policy if exists "uk_square_delete_accounts_boss" on public.uk_square_bookings;
create policy "uk_square_delete_accounts_boss"
  on public.uk_square_bookings for delete to authenticated
  using (public.is_accounts() or public.is_boss());
