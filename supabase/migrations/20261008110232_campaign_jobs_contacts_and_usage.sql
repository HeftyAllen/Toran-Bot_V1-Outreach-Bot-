-- Durable campaigns, public business contacts, budget reservations and feedback.
alter table public.workspace_settings drop constraint workspace_settings_research_limit_check;
alter table public.workspace_settings add constraint workspace_settings_research_limit_check check (research_limit between 1 and 100);
alter table public.workspace_settings
  add column calling_code text not null default '27' check (calling_code ~ '^[0-9]{1,3}$'),
  add column monthly_budget_usd numeric(10,4) not null default 5 check (monthly_budget_usd between 0 and 10000),
  add column run_budget_usd numeric(10,4) not null default 1 check (run_budget_usd between 0.05 and 100),
  add column whatsapp_unit_cost_usd numeric(10,4) check (whatsapp_unit_cost_usd between 0 and 10);

alter table public.leads alter column website_url drop not null;
alter table public.leads
  add column business_key text unique,
  add column contact_email text,
  add column phone text,
  add column whatsapp_url text,
  add column address text,
  add column category text,
  add column contact_sources jsonb not null default '[]'::jsonb,
  add column contacts_verified_at timestamptz,
  add column consent_at timestamptz,
  add column consent_note text,
  add column do_not_contact boolean not null default false,
  add column last_inbound_at timestamptz,
  add column base_score smallint,
  add column calibration_delta smallint not null default 0,
  add column learning_version integer not null default 0,
  add column research_error text;

alter table public.runs drop constraint runs_status_check;
alter table public.runs add constraint runs_status_check check (status in ('running','complete','failed','canceled'));
alter table public.runs
  add column config jsonb not null default '{}'::jsonb,
  add column requested integer not null default 0 check (requested between 0 and 100),
  add column discovered integer not null default 0,
  add column failed integer not null default 0,
  add column search_rounds integer not null default 0,
  add column lead_ids text[] not null default '{}',
  add column stage text not null default 'discover' check (stage in ('discover','research')),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column updated_at timestamptz not null default now();
-- Recover a legacy synchronous run interrupted by deployment.
update public.runs set status='failed', finished_at=now(), message='Legacy run interrupted; start a new campaign' where status='running' and requested=0;

create table public.usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id text references public.runs(id) on delete set null,
  provider text not null default 'openai',
  kind text not null,
  model text,
  state text not null default 'reserved' check (state in ('reserved','estimated','actual','unconfirmed','void')),
  reserved_usd numeric(10,6) not null check (reserved_usd >= 0),
  cost_usd numeric(10,6) check (cost_usd >= 0),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  search_calls integer not null default 0,
  provider_response_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_created_at_idx on public.usage_events(created_at desc);
create index usage_events_run_id_idx on public.usage_events(run_id);

create table public.feedback_events (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id text references public.leads(id) on delete set null,
  company_name text not null,
  outcome text not null check (outcome in ('good_fit','poor_fit','replied','not_interested','booked','won','lost')),
  service_fit text,
  region text,
  category text,
  predicted_score smallint,
  note text,
  recorded_by text not null,
  created_at timestamptz not null default now()
);
create index feedback_events_created_at_idx on public.feedback_events(created_at desc);
create index feedback_events_lead_id_idx on public.feedback_events(lead_id);

create table public.whatsapp_connection (
  id smallint primary key default 1 check (id=1),
  phone_number_id text not null,
  api_version text not null default 'v23.0',
  token_cipher text not null,
  app_secret_cipher text not null,
  verify_token_cipher text not null,
  label text not null default 'WhatsApp Business',
  updated_at timestamptz not null default now()
);
create table public.outreach_messages (
  id uuid primary key,
  lead_id text references public.leads(id) on delete set null,
  request_key text unique not null,
  provider_message_id text unique,
  recipient text not null,
  kind text not null check (kind in ('template','text')),
  content text,
  template_name text,
  status text not null default 'pending' check (status in ('pending','sent','delivered','read','failed','unknown')),
  error text,
  usage_id uuid references public.usage_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outreach_messages_lead_id_idx on public.outreach_messages(lead_id);
create index outreach_messages_usage_id_idx on public.outreach_messages(usage_id);
create index outreach_messages_created_at_idx on public.outreach_messages(created_at desc);
create table public.whatsapp_inbound (
  id text primary key,
  lead_id text references public.leads(id) on delete set null,
  sender text not null,
  text_body text,
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index whatsapp_inbound_lead_id_idx on public.whatsapp_inbound(lead_id);

-- Direct browser requests cannot read any of these tables.
do $block$
declare table_name text;
begin
  foreach table_name in array array['usage_events','feedback_events','whatsapp_connection','outreach_messages','whatsapp_inbound'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy bot1_server_only on public.%I for all to anon using (public.bot1_server_request()) with check (public.bot1_server_request())', table_name);
    execute format('revoke all on table public.%I from public, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to anon, service_role', table_name);
  end loop;
end;
$block$;
grant select,insert,update,delete on public.workspace_members,public.workspace_settings,public.leads,public.runs to service_role;
grant execute on function public.bot1_server_request() to service_role;

create function public.bot1_claim_run(p_token uuid)
returns setof public.runs language plpgsql set search_path='' as $function$
declare job public.runs;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  if not exists (select 1 from public.workspace_settings where id=1 and automation_enabled) then return; end if;
  select * into job from public.runs where status='running' and (lease_expires_at is null or lease_expires_at < now()) order by created_at for update skip locked limit 1;
  if not found then return; end if;
  return query update public.runs set lease_token=p_token, lease_expires_at=now()+interval '120 seconds', updated_at=now() where id=job.id returning *;
end;
$function$;

create function public.bot1_reserve_cost(p_run_id text, p_kind text, p_model text, p_max_usd numeric, p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path='' as $function$
declare settings public.workspace_settings; monthly numeric; run_spend numeric; run_cap numeric; event_id uuid;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  if p_max_usd < 0 or p_max_usd > 10 then raise exception 'Invalid reservation'; end if;
  select * into settings from public.workspace_settings where id=1 for update;
  if p_run_id is not null then
    select coalesce((config->>'budgetUsd')::numeric,settings.run_budget_usd) into run_cap from public.runs where id=p_run_id and status='running' for update;
    if not found or not settings.automation_enabled then raise exception 'Run stopped or paused'; end if;
    select coalesce(sum(coalesce(cost_usd,reserved_usd)),0) into run_spend from public.usage_events where run_id=p_run_id and state<>'void';
    if run_spend+p_max_usd>run_cap then raise exception 'Run budget reached'; end if;
  end if;
  select coalesce(sum(coalesce(cost_usd,reserved_usd)),0) into monthly from public.usage_events where created_at>=date_trunc('month',now()) and state<>'void';
  if monthly+p_max_usd>settings.monthly_budget_usd then raise exception 'Monthly budget reached'; end if;
  insert into public.usage_events(run_id,kind,model,reserved_usd,provider,metadata) values(p_run_id,p_kind,p_model,p_max_usd,case when p_kind='whatsapp' then 'whatsapp' else 'openai' end,p_metadata) returning id into event_id;
  return event_id;
end;
$function$;

create function public.bot1_record_feedback(p_lead_id text,p_outcome text,p_note text,p_email text)
returns void language plpgsql set search_path='' as $function$
declare lead public.leads;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  select * into lead from public.leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  insert into public.feedback_events(lead_id,company_name,outcome,service_fit,region,category,predicted_score,note,recorded_by)
    values(lead.id,lead.company_name,p_outcome,lead.service_fit,lead.region,lead.category,lead.fit_score,left(p_note,1200),p_email);
  update public.leads set outcome=p_outcome,updated_at=now() where id=p_lead_id;
end;
$function$;

revoke all on function public.bot1_claim_run(uuid),public.bot1_reserve_cost(text,text,text,numeric,jsonb),public.bot1_record_feedback(text,text,text,text) from public,authenticated;
grant execute on function public.bot1_claim_run(uuid),public.bot1_reserve_cost(text,text,text,numeric,jsonb),public.bot1_record_feedback(text,text,text,text) to anon,service_role;

create function public.bot1_usage_summary()
returns jsonb language plpgsql stable set search_path='' as $function$
declare summary jsonb;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  select jsonb_build_object(
    'monthEstimatedUsd',coalesce(sum(cost_usd) filter(where state='estimated' and created_at>=date_trunc('month',now())),0),
    'monthActualUsd',coalesce(sum(cost_usd) filter(where state='actual' and created_at>=date_trunc('month',now())),0),
    'allTimeActualUsd',coalesce(sum(cost_usd) filter(where state='actual'),0),
    'monthReservedUsd',coalesce(sum(reserved_usd) filter(where state in ('reserved','unconfirmed') and created_at>=date_trunc('month',now())),0),
    'allTimeEstimatedUsd',coalesce(sum(cost_usd) filter(where state='estimated'),0),
    'unconfirmedCount',count(*) filter(where state='unconfirmed'),
    'inputTokens',coalesce(sum(input_tokens),0),'outputTokens',coalesce(sum(output_tokens),0),'searchCalls',coalesce(sum(search_calls),0),
    'trackingSince',min(created_at)
  ) into summary from public.usage_events;
  return summary;
end;
$function$;
revoke all on function public.bot1_usage_summary() from public,authenticated;
grant execute on function public.bot1_usage_summary() to anon,service_role;
