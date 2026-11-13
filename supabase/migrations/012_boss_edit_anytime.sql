-- Boss may insert/update/delete receipts and vouchers at any time
-- (no day-open or 10-minute window). Accounts keep the existing rules.

drop policy if exists "receipts_insert" on public.receipts;
create policy "receipts_insert"
  on public.receipts for insert to authenticated
  with check (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and created_by = auth.uid()
    )
  );

drop policy if exists "receipts_update" on public.receipts;
create policy "receipts_update"
  on public.receipts for update to authenticated
  using (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
    )
  )
  with check (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
    )
  );

drop policy if exists "receipts_delete" on public.receipts;
create policy "receipts_delete"
  on public.receipts for delete to authenticated
  using (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
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
    )
  );

drop policy if exists "vouchers_update" on public.vouchers;
create policy "vouchers_update"
  on public.vouchers for update to authenticated
  using (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
    )
  )
  with check (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
    )
  );

drop policy if exists "vouchers_delete" on public.vouchers;
create policy "vouchers_delete"
  on public.vouchers for delete to authenticated
  using (
    public.is_boss()
    or (
      public.day_is_open(book_date)
      and now() < editable_until
    )
  );
