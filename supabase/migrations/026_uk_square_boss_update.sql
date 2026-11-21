-- Boss may update UK Square bookings.
-- Safe to re-run.

drop policy if exists "uk_square_update_boss" on public.uk_square_bookings;
create policy "uk_square_update_boss"
  on public.uk_square_bookings for update to authenticated
  using (public.is_boss())
  with check (public.is_boss());
