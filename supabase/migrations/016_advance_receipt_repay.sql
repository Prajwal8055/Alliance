-- Partial/full advance recovery via receipts (no double-count with cash).

alter table public.advances
  add column if not exists repaid_amount numeric(14, 2) not null default 0
    check (repaid_amount >= 0);

alter table public.advances
  add column if not exists repaid_via_receipt boolean not null default false;

-- Backfill fully repaid rows
update public.advances
set repaid_amount = amount
where status = 'repaid'
  and repaid_amount = 0;

create or replace function public.apply_receipt_to_advance(
  p_advance_id uuid,
  p_amount numeric,
  p_date date default null
)
returns public.advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.advances;
  d date := coalesce(p_date, public.cashbook_today());
  apply_amt numeric(14, 2);
  outstanding numeric(14, 2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Repayment amount must be positive';
  end if;

  if not public.is_boss() and d is distinct from public.cashbook_today() then
    raise exception 'Accounts can only apply advance receipts on today';
  end if;

  select * into a from public.advances where id = p_advance_id for update;
  if a.id is null then
    raise exception 'Advance not found';
  end if;
  if a.status is distinct from 'approved' then
    raise exception 'Only approved advances can be reduced by a receipt';
  end if;

  outstanding := a.amount - coalesce(a.repaid_amount, 0);
  if outstanding <= 0 then
    raise exception 'Advance is already fully repaid';
  end if;

  apply_amt := least(p_amount, outstanding);

  update public.advances
  set repaid_amount = coalesce(repaid_amount, 0) + apply_amt,
      repaid_via_receipt = true,
      repaid_by = auth.uid(),
      updated_at = now(),
      status = case
        when coalesce(repaid_amount, 0) + apply_amt >= amount then 'repaid'::public.advance_status
        else status
      end,
      repaid_date = case
        when coalesce(repaid_amount, 0) + apply_amt >= amount then d
        else repaid_date
      end
  where id = p_advance_id
  returning * into a;

  perform public.recompute_opening_balances_from(least(a.book_date, d));
  return a;
end;
$$;

-- Manual repay still credits cash (no receipt). Receipt path uses receipts for cash.
create or replace function public.repay_advance(p_id uuid, p_date date default null)
returns public.advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.advances;
  d date := coalesce(p_date, public.cashbook_today());
  outstanding numeric(14, 2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_boss() and d is distinct from public.cashbook_today() then
    raise exception 'Accounts can only repay on today';
  end if;

  perform public.ensure_cash_book_day(d);

  select * into a from public.advances where id = p_id for update;
  if a.id is null or a.status is distinct from 'approved' then
    raise exception 'Advance not found or not approved';
  end if;

  outstanding := a.amount - coalesce(a.repaid_amount, 0);
  if outstanding <= 0 then
    raise exception 'Advance is already fully repaid';
  end if;

  update public.advances
  set status = 'repaid',
      repaid_amount = amount,
      repaid_date = d,
      repaid_by = auth.uid(),
      repaid_via_receipt = false,
      updated_at = now()
  where id = p_id
  returning * into a;

  perform public.recompute_opening_balances_from(least(a.book_date, d));
  return a;
end;
$$;

-- Closing: receipt cash-in already counted; only manual (non-receipt) repay adds back.
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
      - coalesce((select sum(amount) from public.vouchers v where v.book_date = d.book_date), 0)
      - coalesce((
          select sum(a.amount) from public.advances a
          where a.book_date = d.book_date
            and a.status in ('approved', 'repaid')
        ), 0)
      + coalesce((
          select sum(a.amount) from public.advances a
          where a.repaid_date = d.book_date
            and a.status = 'repaid'
            and a.repaid_via_receipt = false
        ), 0),
    0
  )
  into result
  from public.cash_book_days d
  where d.book_date = p_date;

  return coalesce(result, 0);
end;
$$;

grant execute on function public.apply_receipt_to_advance(uuid, numeric, date) to authenticated;
grant execute on function public.repay_advance(uuid, date) to authenticated;
