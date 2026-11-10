-- First advisor card. Run once in Supabase → SQL Editor after the migrations.
insert into public.advisors (slug, full_name, designation, whatsapp)
values ('vasanth-kumar', 'Vasanth Kumar', 'Sales Advisor', '919606025056')
on conflict (slug) do nothing;

-- Make yourself the first admin (after logging in once, or inviting yourself in
-- Authentication → Users). Replace the email, then run:
-- insert into public.profiles (user_id, role)
-- select id, 'admin' from auth.users where email = 'you@example.com'
-- on conflict (user_id) do update set role = 'admin';
