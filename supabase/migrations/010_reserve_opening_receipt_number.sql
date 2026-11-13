-- R-YYYY-0001 is reserved for the Opening balance line on receipts.
-- Real receipts start at 0002. Vouchers still start at V-YYYY-0001.

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
    -- Never issue 0001 — reserved for Opening balance
    if n < 2 then
      n := nextval('public.receipt_number_seq');
    end if;
    new.receipt_number := 'R-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

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

create or replace function public.reset_entry_number_sequences()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_boss() then
    raise exception 'Only Boss can reset entry numbering';
  end if;

  -- Next receipt is 0002 (0001 = opening balance). Next voucher is 0001.
  perform setval('public.receipt_number_seq', 2, false);
  perform setval('public.voucher_number_seq', 1, false);
end;
$$;

create or replace function public.wipe_all_cash_book_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_count bigint;
  voucher_count bigint;
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
  select count(*) into day_count from public.cash_book_days;

  delete from public.receipts;
  delete from public.vouchers;

  select count(*) into log_count from public.audit_logs;
  delete from public.audit_logs;
  delete from public.cash_book_days;

  perform setval('public.receipt_number_seq', 2, false);
  perform setval('public.voucher_number_seq', 1, false);

  return jsonb_build_object(
    'receipts', receipt_count,
    'vouchers', voucher_count,
    'audit_logs', log_count,
    'cash_book_days', day_count,
    'sequences_reset', true
  );
end;
$$;
