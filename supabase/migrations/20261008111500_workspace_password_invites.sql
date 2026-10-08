alter table public.workspace_members
  add column if not exists password_salt text,
  add column if not exists password_hash text,
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists runs_only_one_active
  on public.runs ((status))
  where status = 'running';

create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
