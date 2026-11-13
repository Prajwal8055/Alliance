-- Ensure full wipe restarts receipt/voucher numbering from 1.
-- Safe to re-run.

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

  -- Next nextval() returns 1 for both sequences
  perform setval('public.receipt_number_seq', 1, false);
  perform setval('public.voucher_number_seq', 1, false);
end;
$$;

revoke all on function public.reset_entry_number_sequences() from public;
grant execute on function public.reset_entry_number_sequences() to authenticated;
grant execute on function public.reset_entry_number_sequences() to service_role;

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

  -- Restart both auto-number sequences from 1
  perform setval('public.receipt_number_seq', 1, false);
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

revoke all on function public.wipe_all_cash_book_data() from public;
grant execute on function public.wipe_all_cash_book_data() to authenticated;
grant execute on function public.wipe_all_cash_book_data() to service_role;
