-- Evidence-based customer qualification; existing server-only RLS/grants stay in place.
alter table public.leads add column if not exists opportunity jsonb
  check (opportunity is null or jsonb_typeof(opportunity) = 'object');
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('queued','new','researching','drafted','reviewed','error'));
alter table public.runs add column if not exists qualified integer not null default 0 check (qualified >= 0);
-- Earlier scores measured generic service overlap, not a supported buying opportunity.
-- Keep their research/history, but require a fresh assessment before presenting a draft.
update public.leads set opportunity = jsonb_build_object(
  'version',1,'status','review','websiteStatus','unknown','service','No clear fit',
  'reason','Earlier research did not check for a specific Toran opportunity. Queue a fresh assessment.',
  'evidence','[]'::jsonb,'checks',null,'officialSearch',null,'checkedAt',now()
) where opportunity is null;
update public.workspace_settings set
  brand_name = case when brand_name = 'New business' then 'Toran Digital' else brand_name end,
  brand_domain = case when brand_domain = '' then 'toran.co.za' else brand_domain end,
  services = case when services = 'Websites, ecommerce, business automation' then
    'Launch: websites and lead capture. Sell: online stores, payments and order handling. Scale: enquiry and booking workflows, follow-ups, cart recovery, inventory and CRM automation.' else services end,
  target_locations = case when target_locations = 'Midrand, Sandton, Johannesburg' then 'Midrand, Sandton, Johannesburg, South Africa' else target_locations end,
  updated_at = now() where id = 1;
notify pgrst, 'reload schema';
