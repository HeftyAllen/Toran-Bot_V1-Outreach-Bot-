-- Only workers with Toran opportunity qualification may process campaigns.
-- Retiring the original RPC also makes older deployments/browser tabs harmless.
create or replace function public.bot1_claim_run(p_token uuid)
returns setof public.runs language plpgsql set search_path='' as $function$
begin
  if current_user <> 'service_role' and not public.bot1_server_request() then raise exception 'Server access required'; end if;
  return;
end;
$function$;

create or replace function public.bot1_claim_qualified_run(p_token uuid)
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

revoke all on function public.bot1_claim_run(uuid),public.bot1_claim_qualified_run(uuid) from public,authenticated;
grant execute on function public.bot1_claim_run(uuid),public.bot1_claim_qualified_run(uuid) to anon,service_role;
notify pgrst,'reload schema';
