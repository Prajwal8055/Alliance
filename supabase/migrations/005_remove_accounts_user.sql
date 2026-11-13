-- Allow Boss to remove Accounts users while preserving ledger history.
-- Safe to re-run.

create or replace function public.guard_receipt_update()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_number is distinct from old.receipt_number then
    raise exception 'receipt_number cannot be changed';
  end if;
  if new.editable_until is distinct from old.editable_until
     and not public.is_boss() then
    raise exception 'editable_until cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by
     and current_setting('cashbook.reassign', true) is distinct from 'on' then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_voucher_update()
returns trigger
language plpgsql
as $$
begin
  if new.voucher_number is distinct from old.voucher_number then
    raise exception 'voucher_number cannot be changed';
  end if;
  if new.editable_until is distinct from old.editable_until
     and not public.is_boss() then
    raise exception 'editable_until cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by
     and current_setting('cashbook.reassign', true) is distinct from 'on' then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reassign_accounts_user_entries(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_boss()
     and coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Only boss can reassign user entries';
  end if;

  perform set_config('cashbook.reassign', 'on', true);

  update public.receipts
  set created_by = p_to
  where created_by = p_from;

  update public.vouchers
  set created_by = p_to
  where created_by = p_from;

  update public.audit_logs
  set actor_id = null
  where actor_id = p_from;

  update public.cash_book_days
  set approved_by = null
  where approved_by = p_from;
end;
$$;

revoke all on function public.reassign_accounts_user_entries(uuid, uuid) from public;
grant execute on function public.reassign_accounts_user_entries(uuid, uuid) to authenticated;
grant execute on function public.reassign_accounts_user_entries(uuid, uuid) to service_role;
