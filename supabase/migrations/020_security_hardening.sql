-- Security hardening: block privilege escalation and forged ledger state.
-- Safe to re-run.

-- 1) Profiles: only service_role may change role / id / created_at
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profile id cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  if new.role is distinct from old.role
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'role cannot be changed';
  end if;

  new.full_name := trim(coalesce(new.full_name, ''));
  return new;
end;
$$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 2) Signup trigger: never trust client/metadata role (admin upserts set role)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'accounts'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3) cash_book_days: remove open insert; creation goes through ensure_cash_book_day (definer)
drop policy if exists "days_insert_authenticated" on public.cash_book_days;

-- 4) Force 10-minute edit window on insert (ignore client-supplied editable_until)
create or replace function public.set_receipt_defaults()
returns trigger
language plpgsql
as $$
declare
  y text := to_char(coalesce(new.entry_date, current_date), 'YYYY');
  n bigint;
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  -- Always enforce window on insert; Boss extends via unlock_entry only
  new.editable_until := now() + interval '10 minutes';
  if new.receipt_number is null or new.receipt_number = '' then
    n := nextval('public.receipt_number_seq');
    new.receipt_number := 'R-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_voucher_defaults()
returns trigger
language plpgsql
as $$
declare
  y text := to_char(coalesce(new.entry_date, current_date), 'YYYY');
  n bigint;
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.editable_until := now() + interval '10 minutes';
  if new.voucher_number is null or new.voucher_number = '' then
    n := nextval('public.voucher_number_seq');
    new.voucher_number := 'V-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 5) Advances: keep approval fields consistent + recompute openings when approved via direct UPDATE
create or replace function public.guard_advance_update()
returns trigger
language plpgsql
as $$
begin
  if new.sl_no is distinct from old.sl_no then
    raise exception 'sl_no cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if new.approved_by is null then
      new.approved_by := auth.uid();
    end if;
    if new.approved_at is null then
      new.approved_at := now();
    end if;
  end if;

  new.person_name := trim(new.person_name);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.advance_after_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.recompute_opening_balances_from(new.book_date);
  elsif new.status = 'repaid' and old.status is distinct from 'repaid' then
    perform public.recompute_opening_balances_from(
      least(new.book_date, coalesce(new.repaid_date, new.book_date))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists advances_after_status_change on public.advances;
create trigger advances_after_status_change
  after update of status on public.advances
  for each row execute function public.advance_after_status_change();
