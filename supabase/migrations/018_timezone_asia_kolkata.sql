-- Cash book calendar day and close time use India (Mysore) time.
create or replace function public.cashbook_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

create or replace function public.close_cash_book_day_if_due(
  p_date date,
  p_timezone text default 'Asia/Kolkata'
)
returns public.cash_book_days
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp without time zone := timezone(p_timezone, now());
  d public.cash_book_days;
begin
  if p_date = local_now::date and local_now::time >= time '18:30' then
    update public.cash_book_days
    set status = 'pending_approval',
        closed_at = coalesce(closed_at, now())
    where book_date = p_date
      and status = 'open';
  end if;

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

grant execute on function public.close_cash_book_day_if_due(date, text) to authenticated;
