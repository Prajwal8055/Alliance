-- Run once in Supabase SQL Editor after 001_cash_book.sql
-- Confirms Boss email and sets role (no secret key needed)

update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', 'Boss', 'role', 'boss')
where email = 'md@spicetrip.com';

insert into public.profiles (id, full_name, role)
select id, 'Boss', 'boss'::public.user_role
from auth.users
where email = 'md@spicetrip.com'
on conflict (id) do update
set
  full_name = 'Boss',
  role = 'boss'::public.user_role;

-- Verify
select u.email, u.email_confirmed_at is not null as confirmed, p.role, p.full_name
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'md@spicetrip.com';
