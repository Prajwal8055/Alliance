-- Boss (super user) may delete UK Square bookings / hide seed rows.
-- Safe to re-run.

-- Tighten delete on user-added rows to Boss only
drop policy if exists "uk_square_delete_accounts_boss" on public.uk_square_bookings;
drop policy if exists "uk_square_delete_boss" on public.uk_square_bookings;
create policy "uk_square_delete_boss"
  on public.uk_square_bookings for delete to authenticated
  using (public.is_boss());

-- Hidden seed sl numbers (static Excel rows Boss removed)
create table if not exists public.uk_square_hidden_sl_nos (
  sl_no integer primary key,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz not null default now()
);

alter table public.uk_square_hidden_sl_nos enable row level security;

drop policy if exists "uk_square_hidden_select" on public.uk_square_hidden_sl_nos;
create policy "uk_square_hidden_select"
  on public.uk_square_hidden_sl_nos for select to authenticated
  using (true);

drop policy if exists "uk_square_hidden_insert_boss" on public.uk_square_hidden_sl_nos;
create policy "uk_square_hidden_insert_boss"
  on public.uk_square_hidden_sl_nos for insert to authenticated
  with check (public.is_boss());

drop policy if exists "uk_square_hidden_delete_boss" on public.uk_square_hidden_sl_nos;
create policy "uk_square_hidden_delete_boss"
  on public.uk_square_hidden_sl_nos for delete to authenticated
  using (public.is_boss());
