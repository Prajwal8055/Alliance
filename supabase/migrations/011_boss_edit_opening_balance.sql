-- Boss may set opening_balance; ensure must not overwrite an existing day row.
-- Later days still refresh via recompute_opening_balances_from after edits.

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

  -- Do not overwrite opening_balance on existing days (Boss may have edited it).

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

grant execute on function public.ensure_cash_book_day(date) to authenticated;
