-- Staff advances: unique active person name, Boss approves each,
-- approved advance reduces cash; repay adds it back.

do $$ begin
  create type public.advance_status as enum ('pending', 'approved', 'repaid');
exception when duplicate_object then null;
end $$;

create sequence if not exists public.advance_sl_seq;

create table if not exists public.advances (
  id uuid primary key default gen_random_uuid(),
  book_date date not null references public.cash_book_days (book_date) on delete restrict,
  entry_date date not null,
  sl_no bigint not null unique default nextval('public.advance_sl_seq'),
  person_name text not null,
  person_key text generated always as (lower(trim(person_name))) stored,
  amount numeric(14, 2) not null check (amount > 0),
  status public.advance_status not null default 'pending',
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  repaid_date date,
  repaid_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advances_book_date_idx on public.advances (book_date);
create index if not exists advances_status_idx on public.advances (status);

-- One active (pending/approved) advance per person name
create unique index if not exists advances_active_person_unique
  on public.advances (person_key)
  where status in ('pending', 'approved');

alter table public.advances enable row level security;

drop policy if exists "advances_select" on public.advances;
create policy "advances_select"
  on public.advances for select to authenticated
  using (true);

drop policy if exists "advances_insert" on public.advances;
create policy "advances_insert"
  on public.advances for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_boss()
      or (
        public.day_is_open(book_date)
        and book_date = public.cashbook_today()
        and entry_date = public.cashbook_today()
      )
    )
  );

drop policy if exists "advances_update" on public.advances;
create policy "advances_update"
  on public.advances for update to authenticated
  using (public.is_boss() or (status = 'pending' and created_by = auth.uid()))
  with check (public.is_boss() or (status = 'pending' and created_by = auth.uid()));

drop policy if exists "advances_delete" on public.advances;
create policy "advances_delete"
  on public.advances for delete to authenticated
  using (
    public.is_boss()
    or (status = 'pending' and created_by = auth.uid())
  );

create or replace function public.set_advance_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.person_name := trim(new.person_name);
  if new.person_name = '' then
    raise exception 'Person name is required';
  end if;
  if new.sl_no is null then
    new.sl_no := nextval('public.advance_sl_seq');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists advances_before_insert on public.advances;
create trigger advances_before_insert
  before insert on public.advances
  for each row execute function public.set_advance_defaults();

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
  new.person_name := trim(new.person_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists advances_before_update on public.advances;
create trigger advances_before_update
  before update on public.advances
  for each row execute function public.guard_advance_update();

create or replace function public.approve_advance(p_id uuid)
returns public.advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.advances;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can approve an advance';
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Boss anytime; Accounts only today
  if not public.is_boss() and d is distinct from public.cashbook_today() then
    raise exception 'Accounts can only repay on today';
  end if;

  perform public.ensure_cash_book_day(d);

  update public.advances
  set status = 'repaid',
      repaid_date = d,
      repaid_by = auth.uid(),
      updated_at = now()
  where id = p_id
    and status = 'approved'
  returning * into a;

  if a.id is null then
    raise exception 'Advance not found or not approved';
  end if;

  perform public.recompute_opening_balances_from(least(a.book_date, d));
  return a;
end;
$$;

grant execute on function public.approve_advance(uuid) to authenticated;
grant execute on function public.repay_advance(uuid, date) to authenticated;

-- Closing = opening + receipts - vouchers - advances given + advances repaid that day
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
        ), 0),
    0
  )
  into result
  from public.cash_book_days d
  where d.book_date = p_date;

  return coalesce(result, 0);
end;
$$;

-- Include advances in wipe
create or replace function public.wipe_all_cash_book_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_count bigint;
  voucher_count bigint;
  advance_count bigint;
  log_count bigint;
  day_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_boss() then
    raise exception 'Only Boss can wipe cash book data';
  end if;

  select count(*) into receipt_count from public.receipts;
  select count(*) into voucher_count from public.vouchers;
  select count(*) into advance_count from public.advances;
  select count(*) into day_count from public.cash_book_days;

  delete from public.receipts;
  delete from public.vouchers;
  delete from public.advances;

  select count(*) into log_count from public.audit_logs;
  delete from public.audit_logs;
  delete from public.cash_book_days;

  perform setval('public.receipt_number_seq', 2, false);
  perform setval('public.voucher_number_seq', 1, false);
  perform setval('public.advance_sl_seq', 1, false);

  return jsonb_build_object(
    'receipts', receipt_count,
    'vouchers', voucher_count,
    'advances', advance_count,
    'audit_logs', log_count,
    'cash_book_days', day_count,
    'sequences_reset', true
  );
end;
$$;

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.advances;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
