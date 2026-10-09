-- Preserve the existing workspace, contacts, budgets, access policies and Cron.
alter table public.workspace_settings add column search_country text not null default 'ZA' check (search_country ~ '^[A-Z]{2}$');
alter table public.leads add column country_code text check (country_code ~ '^[A-Z]{2}$'), add column email_consent_at timestamptz, add column email_consent_note text;
alter table public.runs add column candidates_seen integer not null default 0 check(candidates_seen>=0), add column excluded integer not null default 0 check(excluded>=0), add column duplicates integer not null default 0 check(duplicates>=0), add column sent_count integer not null default 0 check(sent_count>=0), add column outreach_index integer not null default 0 check(outreach_index>=0);
alter table public.runs drop constraint runs_stage_check;
alter table public.runs add constraint runs_stage_check check(stage in ('discover','research','outreach'));
alter table public.runs drop constraint runs_requested_check;
alter table public.runs add constraint runs_requested_check check(requested>=0 and requested<=500);
alter table public.outreach_messages add column channel text not null default 'whatsapp' check(channel in ('whatsapp','email'));
alter table public.outreach_messages drop constraint outreach_messages_kind_check;
alter table public.outreach_messages add constraint outreach_messages_kind_check check(kind in ('template','text','email'));
create table public.provider_connections(id text primary key check(id in ('google_places','resend')), settings jsonb not null default '{}'::jsonb, secret_ciphertext text not null, updated_at timestamptz not null default now());
alter table public.provider_connections enable row level security;
create policy bot1_server_only on public.provider_connections for all to anon using(public.bot1_server_request()) with check(public.bot1_server_request());
revoke all on public.provider_connections from public,authenticated;
grant select,insert,update,delete on public.provider_connections to anon,service_role;

-- Older deployments cannot claim campaigns created by the new dashboard.
create or replace function public.bot1_claim_qualified_run(p_token uuid) returns setof public.runs language plpgsql set search_path='' as $function$
declare job public.runs;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  if not exists(select 1 from public.workspace_settings where id=1 and automation_enabled) then return; end if;
  select * into job from public.runs where status='running' and coalesce((config->>'planVersion')::integer,0)<3 and (lease_expires_at is null or lease_expires_at<now()) order by created_at for update skip locked limit 1;
  if not found then return; end if;
  return query update public.runs set lease_token=p_token,lease_expires_at=now()+interval '120 seconds',updated_at=now() where id=job.id returning *;
end;$function$;
create function public.bot1_claim_smart_run(p_token uuid) returns setof public.runs language plpgsql set search_path='' as $function$
declare job public.runs;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  if not exists(select 1 from public.workspace_settings where id=1 and automation_enabled) then return; end if;
  select * into job from public.runs where status='running' and (lease_expires_at is null or lease_expires_at<now()) order by created_at for update skip locked limit 1;
  if not found then return; end if;
  return query update public.runs set lease_token=p_token,lease_expires_at=now()+interval '120 seconds',updated_at=now() where id=job.id returning *;
end;$function$;

-- Serialize email eligibility, pause/cancel checks, daily cap and reservation.
create function public.bot1_prepare_email(p_lead_id text,p_run_id text,p_key text) returns jsonb language plpgsql set search_path='' as $function$
declare lead public.leads; settings public.workspace_settings; connection public.provider_connections; daily_count integer; usage_id uuid; message_id uuid;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  select * into settings from public.workspace_settings where id=1 for update;
  if not settings.automation_enabled then raise exception 'Bot paused'; end if;
  if p_run_id is not null and not exists(select 1 from public.runs where id=p_run_id and status='running' and config->>'outreachMode'='email') then raise exception 'Campaign stopped or email sending disabled'; end if;
  select * into lead from public.leads where id=p_lead_id for update;
  if not found or lead.do_not_contact or lead.email_consent_at is null or coalesce(lead.email_consent_note,'')='' or coalesce(lead.contact_email,'')='' or coalesce(lead.opportunity->>'status','')<>'qualified' or coalesce((lead.opportunity->>'version')::integer,0)<>2 or coalesce(lead.draft_subject,'')='' or coalesce(lead.draft_body,'')='' then raise exception 'Qualified draft, sourced email and recipient consent required'; end if;
  if not exists(select 1 from jsonb_array_elements(lead.contact_sources) s where s->>'field'='email' and lower(s->>'value')=lower(lead.contact_email) and s->>'url' like 'https://%') then raise exception 'Verified public email source required'; end if;
  if exists(select 1 from public.outreach_messages where lead_id=p_lead_id and channel='email' and status in ('pending','unknown','sent','delivered','read')) then raise exception 'An initial email has already been sent or is unresolved'; end if;
  select * into connection from public.provider_connections where id='resend';
  if not found then raise exception 'Connect email in Settings'; end if;
  select count(*) into daily_count from public.outreach_messages where channel='email' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if daily_count>=coalesce((connection.settings->>'dailyLimit')::integer,0) then raise exception 'Email daily limit reached'; end if;
  usage_id:=public.bot1_reserve_cost(p_run_id,'email_send','Resend',(connection.settings->>'unitCostUsd')::numeric,'{"estimate":true,"source":"Configured per-email estimate"}'::jsonb);
  update public.usage_events set provider='resend' where id=usage_id;
  message_id:=extensions.gen_random_uuid();
  insert into public.outreach_messages(id,lead_id,request_key,recipient,kind,channel,status,content,usage_id) values(message_id,p_lead_id,p_key,lead.contact_email,'email','email','pending',lead.draft_body,usage_id);
  return jsonb_build_object('messageId',message_id,'usageId',usage_id,'recipient',lead.contact_email,'subject',lead.draft_subject,'body',lead.draft_body);
end;$function$;
revoke all on function public.bot1_claim_smart_run(uuid), public.bot1_prepare_email(text,text,text) from public,authenticated;
grant execute on function public.bot1_claim_smart_run(uuid), public.bot1_prepare_email(text,text,text) to anon,service_role;

-- Aggregate the full ledger for recent runs, independent of the UI ledger limit.
create function public.bot1_run_spend() returns jsonb language plpgsql stable set search_path='' as $function$
declare summary jsonb;
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  select coalesce(jsonb_agg(t order by t.created_at desc),'[]'::jsonb) into summary from (
    select r.id as "runId", r.created_at,
      coalesce(sum(u.cost_usd) filter(where u.state in ('estimated','actual')),0) as "spentUsd",
      coalesce(sum(u.reserved_usd) filter(where u.state in ('reserved','unconfirmed')),0) as "reservedUsd",
      coalesce(sum(u.cost_usd) filter(where u.state in ('estimated','actual') and u.kind='email_send'),0) as "emailUsd",
      count(u.id) filter(where u.state='unconfirmed') as "unconfirmedCount"
    from (select id,created_at from public.runs order by created_at desc limit 20) r
    left join public.usage_events u on u.run_id=r.id group by r.id,r.created_at
  ) t;
  return summary;
end;$function$;
revoke all on function public.bot1_run_spend() from public,authenticated;
grant execute on function public.bot1_run_spend() to anon,service_role;
notify pgrst,'reload schema';
