-- Agreement marking: ready by amounts, done only after user marks + Boss approves.
-- Safe to re-run.

create table if not exists public.uk_square_agreements (
  booking_sl_no integer primary key,
  site_no text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved')),
  marked_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  marked_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists uk_square_agreements_status_idx
  on public.uk_square_agreements (status);

alter table public.uk_square_agreements enable row level security;

drop policy if exists "uk_square_agreements_select" on public.uk_square_agreements;
create policy "uk_square_agreements_select"
  on public.uk_square_agreements for select to authenticated
  using (public.is_accounts() or public.is_boss());

drop policy if exists "uk_square_agreements_insert" on public.uk_square_agreements;
create policy "uk_square_agreements_insert"
  on public.uk_square_agreements for insert to authenticated
  with check (public.is_accounts() or public.is_boss());

drop policy if exists "uk_square_agreements_update" on public.uk_square_agreements;
create policy "uk_square_agreements_update"
  on public.uk_square_agreements for update to authenticated
  using (public.is_boss())
  with check (public.is_boss());

drop policy if exists "uk_square_agreements_delete" on public.uk_square_agreements;
create policy "uk_square_agreements_delete"
  on public.uk_square_agreements for delete to authenticated
  using (public.is_boss());

-- Mark agreement (Accounts → pending; Boss → approved immediately).
create or replace function public.mark_uk_square_agreement(
  p_booking_sl_no integer,
  p_site_no text default ''
)
returns public.uk_square_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.uk_square_agreements;
  v_status text;
begin
  if not (public.is_accounts() or public.is_boss()) then
    raise exception 'Not allowed to mark UK Square agreement';
  end if;

  if public.is_boss() then
    v_status := 'approved';
  else
    v_status := 'pending';
  end if;

  insert into public.uk_square_agreements (
    booking_sl_no, site_no, status, marked_by, approved_by, approved_at
  ) values (
    p_booking_sl_no,
    coalesce(p_site_no, ''),
    v_status,
    auth.uid(),
    case when v_status = 'approved' then auth.uid() else null end,
    case when v_status = 'approved' then now() else null end
  )
  on conflict (booking_sl_no) do update set
    site_no = excluded.site_no,
    status = case
      when public.uk_square_agreements.status = 'approved' then 'approved'
      else excluded.status
    end,
    marked_by = coalesce(public.uk_square_agreements.marked_by, excluded.marked_by),
    marked_at = public.uk_square_agreements.marked_at,
    approved_by = case
      when excluded.status = 'approved' then excluded.approved_by
      else public.uk_square_agreements.approved_by
    end,
    approved_at = case
      when excluded.status = 'approved' then excluded.approved_at
      else public.uk_square_agreements.approved_at
    end
  returning * into a;

  return a;
end;
$$;

create or replace function public.approve_uk_square_agreement(p_booking_sl_no integer)
returns public.uk_square_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.uk_square_agreements;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can approve UK Square agreements';
  end if;

  update public.uk_square_agreements
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now()
  where booking_sl_no = p_booking_sl_no
    and status = 'pending'
  returning * into a;

  if a.booking_sl_no is null then
    raise exception 'Pending agreement not found';
  end if;
  return a;
end;
$$;

revoke all on function public.mark_uk_square_agreement(integer, text) from public;
grant execute on function public.mark_uk_square_agreement(integer, text) to authenticated;

revoke all on function public.approve_uk_square_agreement(integer) from public;
grant execute on function public.approve_uk_square_agreement(integer) to authenticated;
