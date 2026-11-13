-- Wipe all cash book entries, days, and audit logs (Boss only).
-- Safe to re-run. Does not delete user profiles.

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

  -- Entry deletes may write audit rows; wipe the log afterward.
  delete from public.receipts;
  delete from public.vouchers;

  select count(*) into log_count from public.audit_logs;
  delete from public.audit_logs;
  delete from public.cash_book_days;

  -- Restart both auto-number sequences from 1 (R-YYYY-0001 / V-YYYY-0001)
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
