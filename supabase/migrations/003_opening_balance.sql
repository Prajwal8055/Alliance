-- Opening balance carries previous day's closing into the next sheet

alter table public.cash_book_days
  add column if not exists opening_balance numeric(14, 2) not null default 0;

create or replace function public.day_closing_balance(p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select d.opening_balance
        + coalesce((select sum(amount) from public.receipts r where r.book_date = d.book_date), 0)
        - coalesce((select sum(amount) from public.vouchers v where v.book_date = d.book_date), 0)
      from public.cash_book_days d
      where d.book_date = p_date
    ),
    0
  );
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
begin
  select public.day_closing_balance(p_date - 1) into prev_close;

  insert into public.cash_book_days (book_date, opening_balance)
  values (p_date, coalesce(prev_close, 0))
  on conflict (book_date) do nothing;

  -- If row already existed with default 0 and prior day now has balance, refresh only while still open and untouched
  update public.cash_book_days
  set opening_balance = coalesce(prev_close, 0)
  where book_date = p_date
    and status = 'open'
    and opening_balance = 0
    and coalesce(prev_close, 0) <> 0
    and not exists (select 1 from public.receipts r where r.book_date = p_date)
    and not exists (select 1 from public.vouchers v where v.book_date = p_date);

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

grant execute on function public.day_closing_balance(date) to authenticated;
grant execute on function public.ensure_cash_book_day(date) to authenticated;
