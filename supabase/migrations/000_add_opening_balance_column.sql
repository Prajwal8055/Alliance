-- Run THIS first if you see: column d.opening_balance does not exist
-- Then re-run 001 / 003 / 007 as needed.

alter table public.cash_book_days
  add column if not exists opening_balance numeric(14, 2) not null default 0;
