-- Boss approval for new UK Square bookings and payment entries.
-- Existing rows are treated as approved. Safe to re-run.

alter table public.uk_square_bookings
  add column if not exists status text not null default 'pending';

alter table public.uk_square_bookings
  drop constraint if exists uk_square_bookings_status_check;

alter table public.uk_square_bookings
  add constraint uk_square_bookings_status_check
  check (status in ('pending', 'approved'));

alter table public.uk_square_payment_entries
  add column if not exists status text not null default 'pending';

alter table public.uk_square_payment_entries
  drop constraint if exists uk_square_payment_entries_status_check;

alter table public.uk_square_payment_entries
  add constraint uk_square_payment_entries_status_check
  check (status in ('pending', 'approved'));

-- Backfill existing data as already approved.
update public.uk_square_bookings
set status = 'approved'
where status is distinct from 'approved';

update public.uk_square_payment_entries
set status = 'approved'
where status is distinct from 'approved';

create index if not exists uk_square_bookings_status_idx
  on public.uk_square_bookings (status);

create index if not exists uk_square_payment_entries_status_idx
  on public.uk_square_payment_entries (status);

-- Non-boss inserts cannot self-approve (seed RPC may set a bypass flag).
create or replace function public.guard_uk_square_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.uk_square_seed_insert', true) = '1' then
    new.status := coalesce(nullif(new.status, ''), 'approved');
    return new;
  end if;
  if not public.is_boss() then
    new.status := 'pending';
  elsif new.status is null or new.status = '' then
    new.status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists uk_square_bookings_before_insert on public.uk_square_bookings;
create trigger uk_square_bookings_before_insert
  before insert on public.uk_square_bookings
  for each row execute function public.guard_uk_square_booking_insert();

create or replace function public.guard_uk_square_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.uk_square_seed_insert', true) = '1' then
    new.status := coalesce(nullif(new.status, ''), 'approved');
    return new;
  end if;
  if not public.is_boss() then
    new.status := 'pending';
  elsif new.status is null or new.status = '' then
    new.status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists uk_square_payment_entries_before_insert on public.uk_square_payment_entries;
create trigger uk_square_payment_entries_before_insert
  before insert on public.uk_square_payment_entries
  for each row execute function public.guard_uk_square_payment_insert();

-- Only boss may flip status to approved.
-- Block non-boss from changing status via direct UPDATE.
create or replace function public.guard_uk_square_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_boss() then
    raise exception 'Only Boss can change UK Square approval status';
  end if;
  return new;
end;
$$;

drop trigger if exists uk_square_bookings_status_update on public.uk_square_bookings;
create trigger uk_square_bookings_status_update
  before update of status on public.uk_square_bookings
  for each row execute function public.guard_uk_square_status_update();

drop trigger if exists uk_square_payment_entries_status_update on public.uk_square_payment_entries;
create trigger uk_square_payment_entries_status_update
  before update of status on public.uk_square_payment_entries
  for each row execute function public.guard_uk_square_status_update();

create or replace function public.approve_uk_square_booking(p_id uuid)
returns public.uk_square_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.uk_square_bookings;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can approve UK Square bookings';
  end if;

  update public.uk_square_bookings
  set status = 'approved'
  where id = p_id
    and status = 'pending'
  returning * into b;

  if b.id is null then
    raise exception 'Pending booking not found';
  end if;

  -- Approve any payment lines created with the booking.
  update public.uk_square_payment_entries
  set status = 'approved'
  where booking_sl_no = b.sl_no
    and status = 'pending';

  perform public.sync_uk_square_booking_totals(b.sl_no);
  return b;
end;
$$;

-- Materialize sheet seed as Sl 1 without requiring boss approval
-- (existing workbook amounts, not a brand-new entry).
create or replace function public.ensure_uk_square_seed_payment(
  p_booking_sl_no integer,
  p_site_no text,
  p_category text,
  p_entry_date date,
  p_amount numeric
)
returns public.uk_square_payment_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.uk_square_payment_entries;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Seed amount must be positive';
  end if;
  if p_category not in ('as_booking', 'total_cash', 'd_kantha', 'd_kantha_cash', 'bsp') then
    raise exception 'Invalid payment category';
  end if;

  select * into e
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = p_category
  order by entry_sl_no
  limit 1;

  if e.id is not null then
    return e;
  end if;

  perform set_config('app.uk_square_seed_insert', '1', true);

  insert into public.uk_square_payment_entries (
    booking_sl_no,
    site_no,
    category,
    entry_sl_no,
    entry_date,
    amount,
    note,
    status,
    created_by
  ) values (
    p_booking_sl_no,
    coalesce(p_site_no, ''),
    p_category,
    1,
    p_entry_date,
    p_amount,
    '',
    'approved',
    auth.uid()
  )
  returning * into e;

  perform public.sync_uk_square_booking_totals(p_booking_sl_no);
  return e;
end;
$$;

create or replace function public.approve_uk_square_payment_entry(p_id uuid)
returns public.uk_square_payment_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.uk_square_payment_entries;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can approve UK Square payment entries';
  end if;

  update public.uk_square_payment_entries
  set status = 'approved'
  where id = p_id
    and status = 'pending'
  returning * into e;

  if e.id is null then
    raise exception 'Pending payment entry not found';
  end if;

  perform public.sync_uk_square_booking_totals(e.booking_sl_no);
  return e;
end;
$$;

revoke all on function public.approve_uk_square_booking(uuid) from public;
grant execute on function public.approve_uk_square_booking(uuid) to authenticated;

revoke all on function public.approve_uk_square_payment_entry(uuid) from public;
grant execute on function public.approve_uk_square_payment_entry(uuid) to authenticated;

revoke all on function public.ensure_uk_square_seed_payment(integer, text, text, date, numeric) from public;
grant execute on function public.ensure_uk_square_seed_payment(integer, text, text, date, numeric) to authenticated;

-- Totals only include approved payment lines.
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
  v_kantha_cash numeric(14, 2);
  v_bsp numeric(14, 2);
  v_has_as boolean;
  v_has_cash boolean;
  v_has_kantha boolean;
  v_has_kantha_cash boolean;
  v_has_bsp boolean;
begin
  select coalesce(sum(amount), 0), count(*) > 0
    into v_as, v_has_as
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'as_booking'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_cash, v_has_cash
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'total_cash'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_kantha, v_has_kantha
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'd_kantha'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_kantha_cash, v_has_kantha_cash
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'd_kantha_cash'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_bsp, v_has_bsp
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'bsp'
    and status = 'approved';

  update public.uk_square_bookings
  set
    to_as_booking = case when v_has_as then nullif(v_as, 0) else to_as_booking end,
    others = case when v_has_cash then nullif(v_cash, 0) else others end,
    mr_d_kantha = case when v_has_kantha then nullif(v_kantha, 0) else mr_d_kantha end,
    d_kantha = case when v_has_kantha_cash then nullif(v_kantha_cash, 0) else d_kantha end,
    bsp = case when v_has_bsp then nullif(v_bsp, 0) else bsp end,
    total = nullif(
      coalesce(case when v_has_cash then v_cash else others end, 0)
      + coalesce(case when v_has_kantha then v_kantha else mr_d_kantha end, 0),
      0
    )
  where sl_no = p_booking_sl_no;
end;
$$;

revoke all on function public.sync_uk_square_booking_totals(integer) from public;
grant execute on function public.sync_uk_square_booking_totals(integer) to authenticated;
