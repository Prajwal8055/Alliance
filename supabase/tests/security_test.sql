-- Security and behaviour tests for 0001_advisor_cards.sql. Any failure aborts with an error.
\set ON_ERROR_STOP 1

-- Fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'manager@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'sales@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'outsider@example.test');
insert into public.advisors (id, slug, full_name, whatsapp, deals_closed, leads_handled, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'test-advisor', 'Test Advisor', '919999999999', 12, 300, true),
  ('10000000-0000-0000-0000-000000000002', 'former-advisor', 'Former Advisor', '918888888888', 5, 90, false),
  ('10000000-0000-0000-0000-000000000003', 'other-advisor', 'Other Advisor', '917777777777', 1, 10, true);
insert into public.profiles (user_id, role, advisor_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', null),
  ('00000000-0000-0000-0000-00000000000b', 'manager', null),
  ('00000000-0000-0000-0000-00000000000c', 'sales', '10000000-0000-0000-0000-000000000001');

-- Validation constraints
do $$ begin
  insert into public.advisors (slug, full_name, whatsapp) values ('Bad Slug!', 'X Y', '919999999999');
  raise exception 'FAIL: bad slug accepted';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.advisors (slug, full_name, whatsapp) values ('ok-slug', 'X Y', '+91 99999');
  raise exception 'FAIL: bad whatsapp accepted';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.advisors (slug, full_name, whatsapp, photo_path) values ('ok-slug', 'X Y', '919999999999', '../../etc/passwd');
  raise exception 'FAIL: bad photo path accepted';
exception when check_violation then null; end $$;

-- ================================================================ anonymous visitor
set role anon;
set request.jwt.claims = '';

do $$ begin
  perform * from public.advisors;
  raise exception 'FAIL: anon read advisors table';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.review_invites;
  raise exception 'FAIL: anon read invites';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.reviews (advisor_id, invite_id, customer_name, rating) values
    ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Fake', 5);
  raise exception 'FAIL: anon inserted review directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.create_review_invite('10000000-0000-0000-0000-000000000001', 'Someone');
  raise exception 'FAIL: anon created invite';
exception when insufficient_privilege then null; end $$;

do $$ declare r record; begin
  select * into r from public.public_advisor_cards where slug = 'test-advisor';
  assert r.whatsapp = '919999999999' and r.deals_closed = 12 and r.is_active, 'active card wrong';
  select * into r from public.public_advisor_cards where slug = 'former-advisor';
  assert not r.is_active and r.whatsapp is null and r.deals_closed is null, 'inactive card leaks contact/stats';
end $$;

do $$ begin
  assert not exists (select 1 from information_schema.columns
                     where table_name in ('public_advisor_cards', 'public_reviews')
                       and column_name in ('leads_handled', 'id', 'customer_name', 'invite_id')),
         'public views expose internal columns';
end $$;

do $$ begin
  assert (select status from public.get_review_invite('not-a-token')) = 'invalid', 'bad format not invalid';
  assert (select status from public.get_review_invite(repeat('a', 64))) = 'invalid', 'unknown token not invalid';
end $$;

-- ================================================================ logged in, no role
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';

do $$ begin
  assert (select count(*) from public.advisors) = 0, 'outsider sees advisors';
  assert (select count(*) from public.reviews) = 0, 'outsider sees reviews';
end $$;
do $$ begin
  perform public.create_review_invite('10000000-0000-0000-0000-000000000001', 'Someone');
  raise exception 'FAIL: outsider created invite';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-00000000000d', 'admin');
  raise exception 'FAIL: outsider made self admin';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.list_staff();
  raise exception 'FAIL: outsider listed staff';
exception when insufficient_privilege then null; end $$;

-- ================================================================ salesperson
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';

do $$ declare n int; begin
  assert (select count(*) from public.advisors) = 1, 'sales should see only own advisor row';
  assert (select leads_handled from public.advisors) = 300, 'sales should see own internal stats';
  update public.advisors set deals_closed = 999;
  get diagnostics n = row_count;
  assert n = 0, 'sales edited own deals_closed';
  update public.profiles set role = 'admin' where user_id = auth.uid();
  get diagnostics n = row_count;
  assert n = 0, 'sales escalated own role';
end $$;
do $$ begin
  perform public.create_review_invite('10000000-0000-0000-0000-000000000001', 'Self Review');
  raise exception 'FAIL: sales created invite for self';
exception when insufficient_privilege then null; end $$;

-- ================================================================ manager
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';

do $$ declare n int; begin
  assert (select count(*) from public.advisors) = 3, 'manager should see all advisors';
  update public.advisors set deals_closed = 13 where slug = 'test-advisor';
  get diagnostics n = row_count;
  assert n = 1, 'manager could not update deals';
  delete from public.advisors where slug = 'other-advisor';
  get diagnostics n = row_count;
  assert n = 0, 'manager deleted an advisor';
end $$;
do $$ begin
  perform public.create_review_invite('10000000-0000-0000-0000-000000000002', 'Someone');
  raise exception 'FAIL: invite created for inactive advisor';
exception when no_data_found then null; end $$;
do $$ begin
  perform public.list_staff();
  raise exception 'FAIL: manager listed staff';
exception when insufficient_privilege then null; end $$;

select public.create_review_invite('10000000-0000-0000-0000-000000000001', '  Ravi Shankar Kumar ') as token \gset
select public.create_review_invite('10000000-0000-0000-0000-000000000001', 'Expired Person') as old_token \gset
select public.create_review_invite('10000000-0000-0000-0000-000000000003', 'Revoked Person') as revoked_token \gset

select not exists (select 1 from public.review_invites where token_hash = convert_to(:'token', 'UTF8'))
       and exists (select 1 from public.review_invites where token_hash = public.hash_token(:'token')) as ok \gset
\if :ok
\else
  \echo 'FAIL: raw token stored or hash missing'
  select 1/0;
\endif
-- psql variables are not visible inside DO bodies, so check them at top level.
select length(:'token') = 64 and :'token' ~ '^[0-9a-f]+$' as token_ok \gset
\if :token_ok
\else
  \echo 'FAIL: token format'
  select 1/0;
\endif

delete from public.review_invites where advisor_id = '10000000-0000-0000-0000-000000000003';

reset role;
update public.review_invites set expires_at = now() - interval '1 minute' where customer_name = 'Expired Person';

-- ================================================================ customer submits review
set role anon;
set request.jwt.claims = '';

select status = 'valid' and advisor_name = 'Test Advisor' as ok from public.get_review_invite(:'token') \gset
\if :ok
\else
  \echo 'FAIL: invite not valid'
  select 1/0;
\endif

-- Out-of-range rating must fail AND leave the link unused.
\set ON_ERROR_STOP 0
select public.submit_review(:'token', 6, 'too high');
\set ON_ERROR_STOP 1
select status = 'valid' as ok from public.get_review_invite(:'token') \gset
\if :ok
\else
  \echo 'FAIL: failed submit consumed the link'
  select 1/0;
\endif

select public.submit_review(:'token', 5, '  Very honest and helpful.  ');
select status = 'used' as ok from public.get_review_invite(:'token') \gset
\if :ok
\else
  \echo 'FAIL: link not marked used'
  select 1/0;
\endif

-- Second use, expired link and revoked link are all rejected.
\set ON_ERROR_STOP 0
select public.submit_review(:'token', 1, 'reuse');
select public.submit_review(:'old_token', 1, 'expired');
select public.submit_review(:'revoked_token', 1, 'revoked');
\set ON_ERROR_STOP 1
reset role;
do $$ begin
  assert (select count(*) from public.reviews) = 1, 'reused/expired/revoked link created a review';
  assert (select comment from public.reviews) = 'Very honest and helpful.', 'comment not trimmed';
  assert (select customer_name from public.reviews) = 'Ravi Shankar Kumar', 'name not trimmed';
end $$;

set role anon;
do $$ declare r record; begin
  select * into r from public.public_reviews where slug = 'test-advisor';
  assert r.customer_display = 'Ravi S.', 'customer name not shortened: ' || r.customer_display;
  select * into r from public.public_advisor_cards where slug = 'test-advisor';
  assert r.avg_rating = 5.0 and r.review_count = 1, 'rating aggregate wrong';
end $$;

-- ================================================================ moderation and team access
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$ declare n int; begin
  update public.reviews set is_hidden = true;
  get diagnostics n = row_count;
  assert n = 0, 'manager hid a review';
end $$;

set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$ declare n int; begin
  update public.reviews set is_hidden = true;
  get diagnostics n = row_count;
  assert n = 1, 'admin could not hide review';
end $$;
do $$ begin
  update public.reviews set rating = 1;
  raise exception 'FAIL: admin rewrote a customer rating';
exception when insufficient_privilege then null; end $$;
do $$ begin
  assert (select count(*) from public.public_reviews) = 0, 'hidden review still public';
  assert (select review_count from public.public_advisor_cards where slug = 'test-advisor') = 0,
         'hidden review still counted';
end $$;

select public.set_staff_role('OUTSIDER@example.test', 'sales', '10000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.list_staff() where role is not null) = 4, 'role not granted';
end $$;
select public.set_staff_role('outsider@example.test', null, null);
do $$ begin
  perform public.set_staff_role('admin@example.test', 'manager', null);
  raise exception 'FAIL: admin demoted self';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

reset role;
\echo 'security_test.sql: all assertions passed'
