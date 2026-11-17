-- Voucher bill photos: create-time upload for Boss review.
-- Compressed JPEGs live in private storage bucket voucher-photos.

alter table public.vouchers
  add column if not exists photo_path text;

comment on column public.vouchers.photo_path is
  'Storage object path in bucket voucher-photos; set once at create.';

-- Prevent changing / clearing photo after it is set (create-only).
create or replace function public.guard_voucher_update()
returns trigger
language plpgsql
as $$
begin
  if new.voucher_number is distinct from old.voucher_number then
    raise exception 'voucher_number cannot be changed';
  end if;
  if new.editable_until is distinct from old.editable_until
     and not public.is_boss() then
    raise exception 'editable_until cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by
     and current_setting('cashbook.reassign', true) is distinct from 'on' then
    raise exception 'created_by cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  if old.photo_path is not null
     and new.photo_path is distinct from old.photo_path then
    raise exception 'voucher photo cannot be changed after create';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Private bucket for voucher photos (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voucher-photos',
  'voucher-photos',
  false,
  512000,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users may read photos (shared ledger / Boss review)
drop policy if exists "voucher_photos_select_authenticated" on storage.objects;
create policy "voucher_photos_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'voucher-photos');

-- Upload only into own folder: {auth.uid()}/{voucher_id}.jpg
drop policy if exists "voucher_photos_insert_own" on storage.objects;
create policy "voucher_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voucher-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') = ''
  );

-- No client updates (replace) — create-only path
drop policy if exists "voucher_photos_update_own" on storage.objects;
create policy "voucher_photos_update_own"
  on storage.objects for update to authenticated
  using (false);

-- Owner or Boss may delete storage objects (voucher delete / wipe)
drop policy if exists "voucher_photos_delete_own_or_boss" on storage.objects;
create policy "voucher_photos_delete_own_or_boss"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voucher-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  );
