-- Opening-balance authorization hardening.
-- Safe to re-run.

-- 0) Role helpers (may be missing if 017/022 were not applied on this DB)
create or replace function public.is_boss()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'boss'
  );
$$;

create or replace function public.is_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'accounts'
  );
$$;

create or replace function public.is_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'hr'
  );
$$;

-- 1) Block direct client inserts into cash_book_days.
-- Days must be created only via ensure_cash_book_day (SECURITY DEFINER).
drop policy if exists "days_insert_authenticated" on public.cash_book_days;

-- 2) ensure_cash_book_day: require a real ledger role; do not overwrite existing openings.
create or replace function public.ensure_cash_book_day(p_date date)
returns public.cash_book_days
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.cash_book_days;
  prev_close numeric(14, 2) := 0;
  has_prev boolean := false;
begin
  if auth.uid() is null
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'not authenticated';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role'
     and not (public.is_boss() or public.is_accounts() or public.is_hr()) then
    raise exception 'not authorized';
  end if;

  select exists (
    select 1 from public.cash_book_days where book_date = p_date - 1
  ) into has_prev;

  select public.day_closing_balance(p_date - 1) into prev_close;

  insert into public.cash_book_days (book_date, opening_balance)
  values (p_date, case when has_prev then coalesce(prev_close, 0) else 0 end)
  on conflict (book_date) do nothing;

  -- Never overwrite an existing day's opening (Boss may have seeded/edited it).

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

-- 3) recompute: role-gated; skip days with no previous day so Boss seed openings are preserved.
create or replace function public.recompute_opening_balances_from(p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  prev_close numeric(14, 2);
  has_prev boolean;
begin
  if auth.uid() is null
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'not authenticated';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role'
     and not (public.is_boss() or public.is_accounts() or public.is_hr()) then
    raise exception 'not authorized';
  end if;

  for r in
    select book_date
    from public.cash_book_days
    where book_date > p_from
    order by book_date
  loop
    select exists (
      select 1 from public.cash_book_days where book_date = r.book_date - 1
    ) into has_prev;

    -- No prior day row: leave Boss/seeded opening alone (do not force 0).
    if not has_prev then
      continue;
    end if;

    select public.day_closing_balance(r.book_date - 1) into prev_close;
    update public.cash_book_days
    set opening_balance = coalesce(prev_close, 0)
    where book_date = r.book_date
      and status = 'open';
  end loop;
end;
$$;

revoke all on function public.ensure_cash_book_day(date) from public;
revoke all on function public.recompute_opening_balances_from(date) from public;
grant execute on function public.ensure_cash_book_day(date) to authenticated;
grant execute on function public.recompute_opening_balances_from(date) to authenticated;
