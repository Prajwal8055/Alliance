-- Global UK Square advances (Boss only) — not tied to a site.
-- Amount goes to Mr. D Kantha (W) or D KANTHA Cash and lessens total BSP.
-- Safe to re-run.

create table if not exists public.uk_square_advances (
  id uuid primary key default gen_random_uuid(),
  destination text not null
    check (destination in ('d_kantha', 'd_kantha_cash')),
  entry_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  note text not null default '',
  status text not null default 'approved'
    check (status in ('pending', 'approved')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists uk_square_advances_date_idx
  on public.uk_square_advances (entry_date desc);

alter table public.uk_square_advances enable row level security;

drop policy if exists "uk_square_advances_select" on public.uk_square_advances;
create policy "uk_square_advances_select"
  on public.uk_square_advances for select to authenticated
  using (public.is_accounts() or public.is_boss());

drop policy if exists "uk_square_advances_insert" on public.uk_square_advances;
create policy "uk_square_advances_insert"
  on public.uk_square_advances for insert to authenticated
  with check (public.is_boss());

drop policy if exists "uk_square_advances_delete" on public.uk_square_advances;
create policy "uk_square_advances_delete"
  on public.uk_square_advances for delete to authenticated
  using (public.is_boss());

create or replace function public.post_uk_square_global_advance(
  p_destination text,
  p_entry_date date,
  p_amount numeric,
  p_note text default ''
)
returns public.uk_square_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.uk_square_advances;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can post UK Square advances';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Advance amount must be greater than zero';
  end if;
  if p_destination not in ('d_kantha', 'd_kantha_cash') then
    raise exception 'Advance destination must be Mr. D Kantha (W) or D KANTHA Cash';
  end if;
  if p_entry_date is null then
    raise exception 'Date is required';
  end if;

  insert into public.uk_square_advances (
    destination, entry_date, amount, note, status, created_by
  ) values (
    p_destination,
    p_entry_date,
    p_amount,
    coalesce(p_note, ''),
    'approved',
    auth.uid()
  )
  returning * into a;

  return a;
end;
$$;

revoke all on function public.post_uk_square_global_advance(text, date, numeric, text) from public;
grant execute on function public.post_uk_square_global_advance(text, date, numeric, text) to authenticated;
