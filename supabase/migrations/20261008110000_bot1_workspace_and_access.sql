create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workspace_members (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('owner', 'viewer')),
  invited_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  brand_name text not null default 'New business',
  brand_domain text not null default '',
  target_market text not null default 'Restaurants and ecommerce businesses',
  target_locations text not null default 'Midrand, Sandton, Johannesburg',
  services text not null default 'Websites, ecommerce, business automation',
  automation_enabled boolean not null default true,
  research_limit smallint not null default 3 check (research_limit in (1, 3, 5)),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id text primary key,
  company_name text not null,
  website_url text not null unique,
  region text,
  status text not null default 'queued' check (status in ('queued', 'new', 'researching', 'drafted', 'error')),
  fit_score smallint check (fit_score between 0 and 100),
  confidence text check (confidence in ('low', 'medium', 'high')),
  service_fit text,
  summary text,
  evidence jsonb not null default '[]'::jsonb,
  draft_subject text,
  draft_body text,
  discovery_source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  researched_at timestamptz,
  outcome text check (outcome in ('good_fit', 'poor_fit', 'replied', 'not_interested', 'booked', 'won', 'lost'))
);

create table if not exists public.runs (
  id text primary key,
  status text not null check (status in ('running', 'complete', 'failed')),
  processed integer not null default 0,
  message text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

insert into public.workspace_members (email, role, invited_by)
values ('jdlamini351@gmail.com', 'owner', 'system')
on conflict (email) do update set role = 'owner';

insert into public.workspace_settings
  (id, brand_name, brand_domain, target_market, target_locations, services, automation_enabled, research_limit)
values
  (1, 'New business', '', 'Restaurants and ecommerce businesses', 'Midrand, Sandton, Johannesburg', 'Websites, ecommerce, business automation', true, 3)
on conflict (id) do nothing;

create or replace function public.bot1_server_request()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.encode(
      extensions.digest(
        coalesce(
          nullif(pg_catalog.current_setting('request.headers', true), '')::pg_catalog.jsonb
            ->> 'x-bot1-internal-token',
          ''
        ),
        'sha256'
      ),
      'hex'
    ) = '549d42aa8e4e60688f2da5a8a182b37de1da1e890cfe1dddea0f43635a513cdb',
    false
  );
$function$;

revoke all on function public.bot1_server_request() from public;
grant execute on function public.bot1_server_request() to anon;

alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.leads enable row level security;
alter table public.runs enable row level security;

drop policy if exists bot1_server_only on public.workspace_members;
create policy bot1_server_only on public.workspace_members
  for all to anon
  using (public.bot1_server_request())
  with check (public.bot1_server_request());

drop policy if exists bot1_server_only on public.workspace_settings;
create policy bot1_server_only on public.workspace_settings
  for all to anon
  using (public.bot1_server_request())
  with check (public.bot1_server_request());

drop policy if exists bot1_server_only on public.leads;
create policy bot1_server_only on public.leads
  for all to anon
  using (public.bot1_server_request())
  with check (public.bot1_server_request());

drop policy if exists bot1_server_only on public.runs;
create policy bot1_server_only on public.runs
  for all to anon
  using (public.bot1_server_request())
  with check (public.bot1_server_request());

grant usage on schema public to anon;
revoke all on table public.workspace_members, public.workspace_settings, public.leads, public.runs from public, authenticated;
grant select, insert, update, delete on table public.workspace_members, public.workspace_settings, public.leads, public.runs to anon;
