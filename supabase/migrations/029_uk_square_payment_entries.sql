-- Dated payment lines per UK Square site / category.
-- Safe to re-run.

create table if not exists public.uk_square_payment_entries (
  id uuid primary key default gen_random_uuid(),
  booking_sl_no integer not null,
  site_no text not null default '',
  category text not null
    check (category in ('as_booking', 'total_cash', 'd_kantha', 'bsp')),
  entry_sl_no integer not null,
  entry_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (booking_sl_no, category, entry_sl_no)
);

create index if not exists uk_square_payment_entries_booking_idx
  on public.uk_square_payment_entries (booking_sl_no);

create index if not exists uk_square_payment_entries_site_idx
  on public.uk_square_payment_entries (site_no);

alter table public.uk_square_payment_entries enable row level security;

drop policy if exists "uk_square_pay_select" on public.uk_square_payment_entries;
create policy "uk_square_pay_select"
  on public.uk_square_payment_entries for select to authenticated
  using (true);

drop policy if exists "uk_square_pay_insert" on public.uk_square_payment_entries;
create policy "uk_square_pay_insert"
  on public.uk_square_payment_entries for insert to authenticated
  with check (public.is_accounts() or public.is_boss());

drop policy if exists "uk_square_pay_update" on public.uk_square_payment_entries;
create policy "uk_square_pay_update"
  on public.uk_square_payment_entries for update to authenticated
  using (public.is_boss())
  with check (public.is_boss());

drop policy if exists "uk_square_pay_delete" on public.uk_square_payment_entries;
create policy "uk_square_pay_delete"
  on public.uk_square_payment_entries for delete to authenticated
  using (public.is_boss());

-- Recompute booking money columns from payment entry sums (when a DB booking exists).
create or replace function public.sync_uk_square_booking_totals(p_booking_sl_no integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as numeric(14, 2);
  v_cash numeric(14, 2);
  v_kantha numeric(14, 2);
  v_bsp numeric(14, 2);
begin
  select coalesce(sum(amount), 0) into v_as
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no and category = 'as_booking';

  select coalesce(sum(amount), 0) into v_cash
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no and category = 'total_cash';

  select coalesce(sum(amount), 0) into v_kantha
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no and category = 'd_kantha';

  select coalesce(sum(amount), 0) into v_bsp
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no and category = 'bsp';

  update public.uk_square_bookings
  set
    to_as_booking = nullif(v_as, 0),
    others = nullif(v_cash, 0),
    mr_d_kantha = nullif(v_kantha, 0),
    d_kantha = nullif(v_kantha, 0),
    bsp = nullif(v_bsp, 0),
    total = nullif(v_cash + v_kantha, 0)
  where sl_no = p_booking_sl_no;
end;
$$;

revoke all on function public.sync_uk_square_booking_totals(integer) from public;
grant execute on function public.sync_uk_square_booking_totals(integer) to authenticated;
