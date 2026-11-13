-- Split advances into salary vs commission (unique active name per kind).

do $$ begin
  create type public.advance_kind as enum ('salary', 'commission');
exception when duplicate_object then null;
end $$;

alter table public.advances
  add column if not exists kind public.advance_kind not null default 'salary';

drop index if exists advances_active_person_unique;

-- One active advance per person within each kind
create unique index if not exists advances_active_person_kind_unique
  on public.advances (kind, person_key)
  where status in ('pending', 'approved');

create index if not exists advances_kind_idx on public.advances (kind);
