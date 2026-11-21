-- Optional remarks on UK Square bookings.
-- Safe to re-run.

alter table public.uk_square_bookings
  add column if not exists remarks text not null default '';
