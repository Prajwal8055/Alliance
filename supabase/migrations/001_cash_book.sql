-- Alliance Square Cash Book (safe to re-run)
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

-- Enums (ignore if already created)
do $$ begin
  create type public.user_role as enum ('boss', 'accounts');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.day_status as enum ('open', 'pending_approval', 'approved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.audit_action as enum ('insert', 'update', 'delete');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.entry_kind as enum ('receipt', 'voucher');
exception when duplicate_object then null;
end $$;

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'accounts',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
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
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'accounts')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Daily sheets
create table if not exists public.cash_book_days (
  id uuid primary key default gen_random_uuid(),
  book_date date not null unique,
  status public.day_status not null default 'open',
  closed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.cash_book_days enable row level security;

drop policy if exists "days_select_authenticated" on public.cash_book_days;
create policy "days_select_authenticated"
  on public.cash_book_days for select to authenticated
  using (true);

drop policy if exists "days_insert_authenticated" on public.cash_book_days;
create policy "days_insert_authenticated"
  on public.cash_book_days for insert to authenticated
  with check (true);

-- Number sequences (never recycled)
create sequence if not exists public.receipt_number_seq;
create sequence if not exists public.voucher_number_seq;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  book_date date not null references public.cash_book_days (book_date) on delete restrict,
  entry_date date not null,
  receipt_number text not null unique,
  description text not null default '',
  amount numeric(14, 2) not null check (amount >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  editable_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  book_date date not null references public.cash_book_days (book_date) on delete restrict,
  entry_date date not null,
  voucher_number text not null unique,
  description text not null default '',
  amount numeric(14, 2) not null check (amount >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  editable_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists receipts_book_date_idx on public.receipts (book_date);
create index if not exists vouchers_book_date_idx on public.vouchers (book_date);

alter table public.receipts enable row level security;
alter table public.vouchers enable row level security;

-- Audit log (all users, all changes)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  book_date date not null,
  entity_type public.entry_kind not null,
  entity_id uuid,
  entity_number text,
  action public.audit_action not null,
  actor_id uuid references public.profiles (id),
  actor_name text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_book_date_idx on public.audit_logs (book_date, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_select_authenticated" on public.audit_logs;
create policy "audit_select_authenticated"
  on public.audit_logs for select to authenticated
  using (true);

-- Helpers
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_boss()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'boss'
  );
$$;

create or replace function public.day_is_open(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cash_book_days
    where book_date = p_date and status = 'open'
  );
$$;

-- Auto receipt number
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
  if new.editable_until is null then
    new.editable_until := now() + interval '10 minutes';
  end if;
  if new.receipt_number is null or new.receipt_number = '' then
    n := nextval('public.receipt_number_seq');
    new.receipt_number := 'R-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists receipts_before_insert on public.receipts;
create trigger receipts_before_insert
  before insert on public.receipts
  for each row execute function public.set_receipt_defaults();

-- Auto voucher number
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
  if new.editable_until is null then
    new.editable_until := now() + interval '10 minutes';
  end if;
  if new.voucher_number is null or new.voucher_number = '' then
    n := nextval('public.voucher_number_seq');
    new.voucher_number := 'V-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vouchers_before_insert on public.vouchers;
create trigger vouchers_before_insert
  before insert on public.vouchers
  for each row execute function public.set_voucher_defaults();

-- Prevent changing numbers / extending window; stamp updated_at
create or replace function public.guard_receipt_update()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_number is distinct from old.receipt_number then
    raise exception 'receipt_number cannot be changed';
  end if;
  if new.editable_until is distinct from old.editable_until then
    raise exception 'editable_until cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists receipts_before_update on public.receipts;
create trigger receipts_before_update
  before update on public.receipts
  for each row execute function public.guard_receipt_update();

create or replace function public.guard_voucher_update()
returns trigger
language plpgsql
as $$
begin
  if new.voucher_number is distinct from old.voucher_number then
    raise exception 'voucher_number cannot be changed';
  end if;
  if new.editable_until is distinct from old.editable_until then
    raise exception 'editable_until cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vouchers_before_update on public.vouchers;
create trigger vouchers_before_update
  before update on public.vouchers
  for each row execute function public.guard_voucher_update();

-- Audit triggers
create or replace function public.audit_receipt_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  select full_name into actor_name from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      new.book_date, 'receipt', new.id, new.receipt_number, 'insert',
      auth.uid(), actor_name, null,
      jsonb_build_object(
        'description', new.description,
        'amount', new.amount,
        'entry_date', new.entry_date,
        'receipt_number', new.receipt_number
      )
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      new.book_date, 'receipt', new.id, new.receipt_number, 'update',
      auth.uid(), actor_name,
      jsonb_build_object(
        'description', old.description,
        'amount', old.amount,
        'entry_date', old.entry_date,
        'receipt_number', old.receipt_number
      ),
      jsonb_build_object(
        'description', new.description,
        'amount', new.amount,
        'entry_date', new.entry_date,
        'receipt_number', new.receipt_number
      )
    );
    return new;
  else
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      old.book_date, 'receipt', old.id, old.receipt_number, 'delete',
      auth.uid(), actor_name,
      jsonb_build_object(
        'description', old.description,
        'amount', old.amount,
        'entry_date', old.entry_date,
        'receipt_number', old.receipt_number
      ),
      null
    );
    return old;
  end if;
end;
$$;

drop trigger if exists receipts_audit on public.receipts;
create trigger receipts_audit
  after insert or update or delete on public.receipts
  for each row execute function public.audit_receipt_change();

create or replace function public.audit_voucher_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  select full_name into actor_name from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      new.book_date, 'voucher', new.id, new.voucher_number, 'insert',
      auth.uid(), actor_name, null,
      jsonb_build_object(
        'description', new.description,
        'amount', new.amount,
        'entry_date', new.entry_date,
        'voucher_number', new.voucher_number
      )
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      new.book_date, 'voucher', new.id, new.voucher_number, 'update',
      auth.uid(), actor_name,
      jsonb_build_object(
        'description', old.description,
        'amount', old.amount,
        'entry_date', old.entry_date,
        'voucher_number', old.voucher_number
      ),
      jsonb_build_object(
        'description', new.description,
        'amount', new.amount,
        'entry_date', new.entry_date,
        'voucher_number', new.voucher_number
      )
    );
    return new;
  else
    insert into public.audit_logs (
      book_date, entity_type, entity_id, entity_number, action,
      actor_id, actor_name, before_data, after_data
    ) values (
      old.book_date, 'voucher', old.id, old.voucher_number, 'delete',
      auth.uid(), actor_name,
      jsonb_build_object(
        'description', old.description,
        'amount', old.amount,
        'entry_date', old.entry_date,
        'voucher_number', old.voucher_number
      ),
      null
    );
    return old;
  end if;
end;
$$;

drop trigger if exists vouchers_audit on public.vouchers;
create trigger vouchers_audit
  after insert or update or delete on public.vouchers
  for each row execute function public.audit_voucher_change();

-- RLS: receipts / vouchers
drop policy if exists "receipts_select" on public.receipts;
create policy "receipts_select"
  on public.receipts for select to authenticated
  using (true);

drop policy if exists "receipts_insert" on public.receipts;
create policy "receipts_insert"
  on public.receipts for insert to authenticated
  with check (
    public.day_is_open(book_date)
    and created_by = auth.uid()
  );

drop policy if exists "receipts_update" on public.receipts;
create policy "receipts_update"
  on public.receipts for update to authenticated
  using (
    public.day_is_open(book_date)
    and now() < editable_until
  )
  with check (
    public.day_is_open(book_date)
    and now() < editable_until
  );

drop policy if exists "receipts_delete" on public.receipts;
create policy "receipts_delete"
  on public.receipts for delete to authenticated
  using (
    public.day_is_open(book_date)
    and now() < editable_until
  );

drop policy if exists "vouchers_select" on public.vouchers;
create policy "vouchers_select"
  on public.vouchers for select to authenticated
  using (true);

drop policy if exists "vouchers_insert" on public.vouchers;
create policy "vouchers_insert"
  on public.vouchers for insert to authenticated
  with check (
    public.day_is_open(book_date)
    and created_by = auth.uid()
  );

drop policy if exists "vouchers_update" on public.vouchers;
create policy "vouchers_update"
  on public.vouchers for update to authenticated
  using (
    public.day_is_open(book_date)
    and now() < editable_until
  )
  with check (
    public.day_is_open(book_date)
    and now() < editable_until
  );

drop policy if exists "vouchers_delete" on public.vouchers;
create policy "vouchers_delete"
  on public.vouchers for delete to authenticated
  using (
    public.day_is_open(book_date)
    and now() < editable_until
  );

drop policy if exists "days_update_boss" on public.cash_book_days;
create policy "days_update_boss"
  on public.cash_book_days for update to authenticated
  using (public.is_boss())
  with check (public.is_boss());

create or replace function public.close_cash_book_day(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.cash_book_days
  set status = 'pending_approval',
      closed_at = coalesce(closed_at, now())
  where book_date = p_date
    and status = 'open';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.close_cash_book_day(date) from public;
grant execute on function public.close_cash_book_day(date) to service_role;

create or replace function public.approve_cash_book_day(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_boss() then
    raise exception 'Only boss can approve';
  end if;
  update public.cash_book_days
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      closed_at = coalesce(closed_at, now())
  where book_date = p_date
    and status in ('open', 'pending_approval');
end;
$$;

create or replace function public.unlock_cash_book_day(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_boss() then
    raise exception 'Only boss can unlock';
  end if;
  update public.cash_book_days
  set status = 'open',
      approved_at = null,
      approved_by = null,
      closed_at = null
  where book_date = p_date;
end;
$$;

grant execute on function public.approve_cash_book_day(date) to authenticated;
grant execute on function public.unlock_cash_book_day(date) to authenticated;

create or replace function public.ensure_cash_book_day(p_date date)
returns public.cash_book_days
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.cash_book_days;
begin
  insert into public.cash_book_days (book_date)
  values (p_date)
  on conflict (book_date) do nothing;

  select * into d from public.cash_book_days where book_date = p_date;
  return d;
end;
$$;

grant execute on function public.ensure_cash_book_day(date) to authenticated;

create or replace function public.close_cash_book_day_if_due(
  p_date date,
  p_timezone text default 'America/Los_Angeles'
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

-- Backfill profile for any existing auth users missing a row
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  coalesce((u.raw_user_meta_data->>'role')::public.user_role, 'accounts')
from auth.users u
on conflict (id) do nothing;
