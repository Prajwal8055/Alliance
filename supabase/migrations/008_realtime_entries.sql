-- Broadcast entry/day changes to all signed-in clients via Supabase Realtime.
do $$
begin
  begin
    alter publication supabase_realtime add table public.receipts;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.vouchers;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.cash_book_days;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.audit_logs;
  exception
    when duplicate_object then null;
  end;
end $$;

-- Needed so book_date filters work on UPDATE/DELETE events.
alter table public.receipts replica identity full;
alter table public.vouchers replica identity full;
alter table public.cash_book_days replica identity full;
alter table public.audit_logs replica identity full;
