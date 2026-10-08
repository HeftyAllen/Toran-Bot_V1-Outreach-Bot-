-- Read-only status checks. No decrypted secret values are selected.
select jobname,schedule,active from cron.job where jobname='bot1-campaign-worker';
select name from vault.secrets where name in ('bot1_worker_url','bot1_worker_token');
select status,requested,discovered,processed,failed,message,updated_at,lease_expires_at from public.runs order by created_at desc limit 10;
select jobid,status,start_time,end_time,return_message from cron.job_run_details order by start_time desc limit 10;
-- A successful Cron tick means the dispatcher ran, not that the HTTP worker succeeded.
select id,status_code,timed_out,error_msg,created from net._http_response order by created desc limit 10;
