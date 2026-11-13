-- Allow Boss to reopen a locked entry's 10-minute edit window.
-- Safe to re-run.

create or replace function public.guard_receipt_update()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_number is distinct from old.receipt_number then
    raise exception 'receipt_number cannot be changed';
  end if;
  -- Boss may extend editable_until via unlock_entry; others cannot.
  if new.editable_until is distinct from old.editable_until
     and not public.is_boss() then
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

create or replace function public.unlock_entry(
  p_kind public.entry_kind,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_boss() then
    raise exception 'Only boss can unlock an entry';
  end if;

  if p_kind = 'receipt' then
    update public.receipts
    set editable_until = now() + interval '10 minutes'
    where id = p_id;
    if not found then
      raise exception 'Receipt not found';
    end if;
  elsif p_kind = 'voucher' then
    update public.vouchers
    set editable_until = now() + interval '10 minutes'
    where id = p_id;
    if not found then
      raise exception 'Voucher not found';
    end if;
  else
    raise exception 'Invalid entry kind';
  end if;
end;
$$;

revoke all on function public.unlock_entry(public.entry_kind, uuid) from public;
grant execute on function public.unlock_entry(public.entry_kind, uuid) to authenticated;
