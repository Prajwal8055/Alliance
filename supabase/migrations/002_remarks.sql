-- Remarks on daily sheet and line items (for boss bank-statement view)

alter table public.cash_book_days
  add column if not exists remarks text not null default '';

alter table public.receipts
  add column if not exists remarks text not null default '';

alter table public.vouchers
  add column if not exists remarks text not null default '';
