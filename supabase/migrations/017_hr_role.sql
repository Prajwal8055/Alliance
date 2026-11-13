-- HR role: owns salary/commission advances (tab + CRUD/approve).

do $$ begin
  alter type public.user_role add value if not exists 'hr';
exception
  when duplicate_object then null;
end $$;

create or replace function public.is_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'hr'
  );
$$;

-- Advances: HR (or Boss) manage; everyone can still read (receipt recovery).
drop policy if exists "advances_insert" on public.advances;
create policy "advances_insert"
  on public.advances for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_hr() or public.is_boss())
  );

drop policy if exists "advances_update" on public.advances;
create policy "advances_update"
  on public.advances for update to authenticated
  using (public.is_hr() or public.is_boss())
  with check (public.is_hr() or public.is_boss());

drop policy if exists "advances_delete" on public.advances;
create policy "advances_delete"
  on public.advances for delete to authenticated
  using (public.is_hr() or public.is_boss());

create or replace function public.approve_advance(p_id uuid)
returns public.advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.advances;
begin
  if not (public.is_hr() or public.is_boss()) then
    raise exception 'Only HR or Boss can approve an advance';
  end if;

  update public.advances
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_id
    and status = 'pending'
  returning * into a;

  if a.id is null then
    raise exception 'Advance not found or not pending';
  end if;

  perform public.recompute_opening_balances_from(a.book_date);
  return a;
end;
$$;

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

  if not (public.is_hr() or public.is_boss()) then
    raise exception 'Only HR or Boss can repay an advance';
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
