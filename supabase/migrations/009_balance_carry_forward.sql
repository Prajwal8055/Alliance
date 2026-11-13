-- Closing = opening + receipts - vouchers
-- Opening = previous day's closing (when a previous day exists)

create or replace function public.day_closing_balance(p_date date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result numeric(14, 2);
begin
  select coalesce(
    d.opening_balance
      + coalesce((select sum(amount) from public.receipts r where r.book_date = d.book_date), 0)
      - coalesce((select sum(amount) from public.vouchers v where v.book_date = d.book_date), 0),
    0
  )
  into result
  from public.cash_book_days d
  where d.book_date = p_date;

  return coalesce(result, 0);
end;
$$;

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
  select exists (
    select 1 from public.cash_book_days where book_date = p_date - 1
  ) into has_prev;

  select public.day_closing_balance(p_date - 1) into prev_close;

  insert into public.cash_book_days (book_date, opening_balance)
  values (p_date, case when has_prev then coalesce(prev_close, 0) else 0 end)
  on conflict (book_date) do nothing;

  -- Keep open days in sync with the previous day's closing.
  -- If there is no previous day, leave a seeded opening balance alone.
  if has_prev then
    update public.cash_book_days
    set opening_balance = coalesce(prev_close, 0)
    where book_date = p_date
      and status = 'open';
  end if;

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

-- After entries change on a day, refresh openings for all later open days.
create or replace function public.recompute_opening_balances_from(p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  prev_close numeric(14, 2);
begin
  for r in
    select book_date
    from public.cash_book_days
    where book_date > p_from
    order by book_date
  loop
    select public.day_closing_balance(r.book_date - 1) into prev_close;
    update public.cash_book_days
    set opening_balance = coalesce(prev_close, 0)
    where book_date = r.book_date
      and status = 'open';
  end loop;
end;
$$;

grant execute on function public.day_closing_balance(date) to authenticated;
grant execute on function public.ensure_cash_book_day(date) to authenticated;
grant execute on function public.recompute_opening_balances_from(date) to authenticated;
