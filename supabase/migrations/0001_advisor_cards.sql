-- Alliance Square: verified advisor identity cards.
-- Plain Postgres (13+) apart from Supabase's auth.uid() / auth.users and the
-- anon/authenticated roles, so it can move to AWS RDS later with a thin auth shim.

create type public.staff_role as enum ('admin', 'manager', 'sales');

create table public.advisors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  full_name     text not null check (length(btrim(full_name)) between 2 and 80),
  designation   text not null default 'Sales Advisor' check (length(btrim(designation)) between 2 and 80),
  photo_path    text check (photo_path is null or photo_path ~ '^[a-z0-9-]+/[a-z0-9-]+\.(jpg|png|webp)$'),
  -- Digits only, with country code, e.g. 919606025056.
  whatsapp      text not null check (whatsapp ~ '^[1-9][0-9]{9,14}$'),
  deals_closed  integer not null default 0 check (deals_closed >= 0),
  -- Internal only: never exposed through the public views.
  leads_handled integer not null default 0 check (leads_handled >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.staff_role not null,
  advisor_id uuid references public.advisors (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_needs_advisor check (role <> 'sales' or advisor_id is not null)
);

create table public.review_invites (
  id            uuid primary key default gen_random_uuid(),
  advisor_id    uuid not null references public.advisors (id) on delete cascade,
  token_hash    bytea not null unique,           -- sha256 of the token; the raw token is never stored
  customer_name text not null check (length(btrim(customer_name)) between 2 and 80),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  used_at       timestamptz
);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  advisor_id    uuid not null references public.advisors (id) on delete cascade,
  invite_id     uuid not null unique references public.review_invites (id) on delete cascade,
  customer_name text not null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (comment is null or length(comment) <= 1000),
  is_hidden     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index on public.review_invites (advisor_id);
create index on public.reviews (advisor_id, created_at desc);

-- ---------------------------------------------------------------- helpers

create function public.my_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create function public.my_advisor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select advisor_id from public.profiles where user_id = auth.uid()
$$;

create function public.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'manager'), false)
$$;

-- ---------------------------------------------------------------- row level security

alter table public.advisors       enable row level security;
alter table public.profiles       enable row level security;
alter table public.review_invites enable row level security;
alter table public.reviews        enable row level security;

-- Nothing in the base tables is readable or writable anonymously; the public
-- only sees the column-limited views below.
revoke all on public.advisors, public.profiles, public.review_invites, public.reviews from anon;

create policy advisors_select on public.advisors for select to authenticated
  using (public.is_editor() or id = public.my_advisor_id());
create policy advisors_insert on public.advisors for insert to authenticated
  with check (public.is_editor());
create policy advisors_update on public.advisors for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy advisors_delete on public.advisors for delete to authenticated
  using (public.my_role() = 'admin');

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');
create policy profiles_write on public.profiles for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Invites are created only through create_review_invite(); editors may list or revoke them.
revoke insert, update on public.review_invites from authenticated;
create policy invites_select on public.review_invites for select to authenticated
  using (public.is_editor());
create policy invites_delete on public.review_invites for delete to authenticated
  using (public.is_editor() and used_at is null);

-- Reviews are created only through submit_review(); only an admin may hide/unhide.
revoke insert, update, delete on public.reviews from authenticated;
grant update (is_hidden) on public.reviews to authenticated;
create policy reviews_select on public.reviews for select to authenticated
  using (public.is_editor() or advisor_id = public.my_advisor_id());
create policy reviews_hide on public.reviews for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------- public views
-- Run as the view owner on purpose: they expose only safe columns. Lead counts,
-- invite data and full customer names never leave the base tables.

create view public.public_advisor_cards with (security_invoker = false) as
select a.slug,
       a.full_name,
       a.designation,
       a.photo_path,
       a.is_active,
       case when a.is_active then a.whatsapp end      as whatsapp,
       case when a.is_active then a.deals_closed end  as deals_closed,
       case when a.is_active then round(avg(r.rating), 1) end as avg_rating,
       case when a.is_active then count(r.id) end     as review_count
from public.advisors a
left join public.reviews r on r.advisor_id = a.id and not r.is_hidden
group by a.id;

create view public.public_reviews with (security_invoker = false) as
select a.slug,
       r.rating,
       r.comment,
       r.created_at,
       split_part(btrim(r.customer_name), ' ', 1)
         || coalesce(' ' || nullif(left(split_part(btrim(r.customer_name), ' ', 2), 1), '') || '.', '')
         as customer_display
from public.reviews r
join public.advisors a on a.id = r.advisor_id
where a.is_active and not r.is_hidden;

grant select on public.public_advisor_cards, public.public_reviews to anon, authenticated;

-- ---------------------------------------------------------------- review flow

create function public.hash_token(p_token text) returns bytea
language sql immutable set search_path = '' as $$
  select sha256(convert_to(p_token, 'UTF8'))
$$;

-- Returns the raw one-time token (244 random bits). Only its hash is stored.
create function public.create_review_invite(p_advisor_id uuid, p_customer_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if not public.is_editor() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.advisors where id = p_advisor_id and is_active) then
    raise exception 'Advisor not found or inactive' using errcode = 'P0002';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.review_invites (advisor_id, token_hash, customer_name, created_by)
  values (p_advisor_id, public.hash_token(v_token), btrim(p_customer_name), auth.uid());
  return v_token;
end $$;

create function public.get_review_invite(p_token text)
returns table (status text, advisor_name text, customer_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;
  return query
    select case when i.used_at is not null then 'used'
                when i.expires_at <= now() or not a.is_active then 'expired'
                else 'valid' end,
           a.full_name,
           i.customer_name
    from public.review_invites i
    join public.advisors a on a.id = i.advisor_id
    where i.token_hash = public.hash_token(p_token);
  if not found then
    return query select 'invalid'::text, null::text, null::text;
  end if;
end $$;

create function public.submit_review(p_token text, p_rating integer, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.review_invites;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This review link is not valid' using errcode = 'P0001';
  end if;

  select i.* into v_invite
  from public.review_invites i
  join public.advisors a on a.id = i.advisor_id
  where i.token_hash = public.hash_token(p_token)
    and i.used_at is null and i.expires_at > now() and a.is_active
  for update of i;

  if not found then
    raise exception 'This review link is not valid, has expired, or was already used' using errcode = 'P0001';
  end if;

  update public.review_invites set used_at = now() where id = v_invite.id;
  insert into public.reviews (advisor_id, invite_id, customer_name, rating, comment)
  values (v_invite.advisor_id, v_invite.id, v_invite.customer_name, p_rating,
          nullif(btrim(p_comment), ''));
end $$;

-- ---------------------------------------------------------------- team access (admin only)

create function public.list_staff()
returns table (user_id uuid, email text, role public.staff_role, advisor_id uuid, advisor_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.my_role() <> 'admin', true) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.role, p.advisor_id, a.full_name
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.advisors a on a.id = p.advisor_id
    order by u.email;
end $$;

-- p_role null removes access.
create function public.set_staff_role(p_email text, p_role public.staff_role, p_advisor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if coalesce(public.my_role() <> 'admin', true) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No login exists for that email. Invite the user in Supabase first.' using errcode = 'P0002';
  end if;
  if v_user = auth.uid() and coalesce(p_role <> 'admin', true) then
    raise exception 'You cannot remove your own admin access' using errcode = 'P0001';
  end if;
  if p_role is null then
    delete from public.profiles where user_id = v_user;
  else
    insert into public.profiles (user_id, role, advisor_id)
    values (v_user, p_role, case when p_role = 'sales' then p_advisor_id end)
    on conflict (user_id) do update set role = excluded.role, advisor_id = excluded.advisor_id;
  end if;
end $$;

-- ---------------------------------------------------------------- function grants

revoke execute on function
  public.my_role(), public.my_advisor_id(), public.is_editor(),
  public.create_review_invite(uuid, text), public.list_staff(),
  public.set_staff_role(text, public.staff_role, uuid),
  public.get_review_invite(text), public.submit_review(text, integer, text)
from public, anon;

grant execute on function
  public.my_role(), public.my_advisor_id(), public.is_editor(),
  public.create_review_invite(uuid, text), public.list_staff(),
  public.set_staff_role(text, public.staff_role, uuid)
to authenticated;

grant execute on function public.get_review_invite(text), public.submit_review(text, integer, text)
to anon, authenticated;
