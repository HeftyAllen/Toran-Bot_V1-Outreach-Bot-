create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists bot1_private;
revoke all on schema bot1_private from public,anon,authenticated;
-- Only postgres/pg_cron can invoke this function. It requires Vault access,
-- which is deliberately unavailable to browser and application roles.
create function bot1_private.tick_campaigns()
returns void language plpgsql security definer set search_path='' as $function$
declare target_url text; worker_token text;
begin
  if not exists(select 1 from public.workspace_settings where id=1 and automation_enabled) or
     not exists(select 1 from public.runs where status='running' and (lease_expires_at is null or lease_expires_at < now())) then return; end if;
  select decrypted_secret into target_url from vault.decrypted_secrets where name='bot1_worker_url' limit 1;
  select decrypted_secret into worker_token from vault.decrypted_secrets where name='bot1_worker_token' limit 1;
  if target_url is null or worker_token is null then return; end if;
  perform net.http_post(url:=target_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_token),body:='{}'::jsonb,timeout_milliseconds:=60000);
end;
$function$;
revoke all on function bot1_private.tick_campaigns() from public,anon,authenticated,service_role;
select cron.schedule('bot1-campaign-worker','* * * * *','select bot1_private.tick_campaigns();');
