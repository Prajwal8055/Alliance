-- Accounts may only insert receipts/vouchers on today's cash-book date.
-- Boss is unchanged (edit anytime).

create or replace function public.cashbook_today()
returns date
language sql
stable
as $$
  select (timezone('America/Los_Angeles', now()))::date;
$$;

drop policy if exists "receipts_insert" on public.receipts;
create policy "receipts_insert"
  on public.receipts for insert to authenticated
  with check (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and created_by = auth.uid()
      and book_date = public.cashbook_today()
      and entry_date = public.cashbook_today()
    )
  );

drop policy if exists "vouchers_insert" on public.vouchers;
create policy "vouchers_insert"
  on public.vouchers for insert to authenticated
  with check (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and created_by = auth.uid()
      and book_date = public.cashbook_today()
      and entry_date = public.cashbook_today()
    )
  );
