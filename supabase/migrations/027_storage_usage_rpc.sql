-- Report voucher-photo (and total) storage usage for authenticated users.
-- Safe to re-run.

create or replace function public.get_storage_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_photos bigint := 0;
  v_photos_count bigint := 0;
  v_all bigint := 0;
  v_all_count bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select
    coalesce(sum((o.metadata->>'size')::bigint), 0),
    count(*)
  into v_photos, v_photos_count
  from storage.objects o
  where o.bucket_id = 'voucher-photos';

  select
    coalesce(sum((o.metadata->>'size')::bigint), 0),
    count(*)
  into v_all, v_all_count
  from storage.objects o;

  return jsonb_build_object(
    'used_bytes', v_photos,
    'file_count', v_photos_count,
    'all_buckets_used_bytes', v_all,
    'all_buckets_file_count', v_all_count
  );
end;
$$;

revoke all on function public.get_storage_usage() from public;
grant execute on function public.get_storage_usage() to authenticated;
