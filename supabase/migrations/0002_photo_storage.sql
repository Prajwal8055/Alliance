-- Supabase Storage bucket for advisor photos (public read, editors write, 2 MB, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('advisor-photos', 'advisor-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy advisor_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'advisor-photos' and public.is_editor());
create policy advisor_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'advisor-photos' and public.is_editor());
create policy advisor_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'advisor-photos' and public.is_editor());
-- Storage needs SELECT for remove(); public visitors read through the public URL instead.
create policy advisor_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'advisor-photos' and public.is_editor());
