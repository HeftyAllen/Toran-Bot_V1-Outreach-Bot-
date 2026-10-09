// Runs the actual standalone server against an isolated in-memory database mock.
// No real credentials, paid requests, live DB writes, or messages are used.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const sessionSecret='synthetic-smoke-test-session-secret-at-least-32-characters';
const workerSecret='synthetic-smoke-test-worker-secret';
const inviteToken='synthetic-invitation-token-for-isolated-tests';
const members=[{email:'owner@example.test',role:'owner'}, {email:'viewer@example.test',role:'viewer'}, {email:'partner@example.test',role:'viewer',invite_token_hash:createHash('sha256').update(inviteToken).digest('base64url'),invite_expires_at:new Date(Date.now()+60000).toISOString()}, {email:'expired@example.test',role:'viewer',invite_token_hash:createHash('sha256').update(inviteToken).digest('base64url'),invite_expires_at:new Date(Date.now()-60000).toISOString()}];
const settings={id:1,brand_name:'Toran test',brand_domain:'',target_market:'Restaurants',target_locations:'Sandton, South Africa',services:'Websites',automation_enabled:true,research_limit:3,run_budget_usd:1,monthly_budget_usd:5,whatsapp_unit_cost_usd:null,calling_code:'27'};
const runs=[];const lead={id:'test-lead',company_name:'Test restaurant',website_url:'https://example.com',region:'Sandton',status:'queued',evidence:[],contact_sources:[],do_not_contact:false,fit_score:null,created_at:new Date().toISOString()};
const tables={workspace_settings:[settings],leads:[lead],runs,feedback_events:[],usage_events:[],outreach_messages:[],whatsapp_inbound:[],whatsapp_connection:[]};
let workerEnabled=false;
const mock=createServer(async(req,res)=>{const url=new URL(req.url,'http://mock');const table=url.pathname.replace('/rest/v1/','');res.setHeader('Content-Type','application/json');let rows;
  if(table==='workspace_members'){
    const email=(url.searchParams.get('email')??'').replace('eq.','');
    const token=(url.searchParams.get('invite_token_hash')??'').replace('eq.','');
    const expiry=(url.searchParams.get('invite_expires_at')??'').replace('gt.','');
    rows=members.filter(x=>(!email||x.email===email)&&(!token||x.invite_token_hash===token)&&(!expiry||(x.invite_expires_at&&x.invite_expires_at>expiry)));
    if(req.method==='PATCH'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');rows.forEach(x=>Object.assign(x,input));}
  }
  else if(table.startsWith('rpc/')){
    let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');
    if(table==='rpc/bot1_usage_summary')rows={monthEstimatedUsd:0,monthActualUsd:0,monthReservedUsd:0,allTimeEstimatedUsd:0,allTimeActualUsd:0,unconfirmedCount:0,inputTokens:0,outputTokens:0,searchCalls:0,trackingSince:null};
    else if(table==='rpc/bot1_claim_run'){
      const job=workerEnabled?runs.find(x=>x.status==='running'):undefined;
      if(job){job.lease_token=input.p_token;job.search_rounds??=0;}
      rows=job?[job]:[];
    }else if(table==='rpc/bot1_reserve_cost'){
      const id=`synthetic-usage-${tables.usage_events.length}`;
      tables.usage_events.push({id,run_id:input.p_run_id,kind:input.p_kind,reserved_usd:input.p_max_usd});rows=id;
    }else rows=[];
  }
  else{rows=tables[table]??[];if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');rows.push({...input,processed:0,failed:0,qualified:0,discovered:0,created_at:new Date().toISOString()});rows=[rows.at(-1)];}else{
    rows=rows.filter(row=>[...url.searchParams].every(([key,value])=>value.startsWith('eq.')?String(row[key])===value.slice(3):value.startsWith('in.(')?value.slice(4,-1).split(',').includes(row[key]):true));
    if(req.method==='PATCH'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');rows.forEach(x=>Object.assign(x,input));}
  }}
  res.end(JSON.stringify(rows));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const dbPort=mock.address().port;const port=4267;
let output='';const child=spawn(process.execPath,['scripts/start-cloud-run.mjs'],{env:{...process.env,NODE_OPTIONS:'--import ./tests/discovery-fetch.mjs',HOSTNAME:'127.0.0.1',PORT:String(port),APP_RUNTIME:'cloud-run',SUPABASE_URL:`http://127.0.0.1:${dbPort}`,SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC_TEST',APP_SESSION_SECRET:sessionSecret,APP_ENCRYPTION_SECRET:sessionSecret,WORKER_SECRET:workerSecret,OPENAI_API_KEY:'synthetic-never-used',OWNER_EMAIL:'owner@example.test'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
function cookie(email){const payload=Buffer.from(JSON.stringify({email,expiresAt:Math.floor(Date.now()/1000)+600})).toString('base64url');return `bot1_session=${payload}.${createHmac('sha256',sessionSecret).update(payload).digest('base64url')}`;}
async function call(path,method='GET',body,auth){return fetch(`http://127.0.0.1:${port}${path}`,{method,redirect:'manual',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth?{Cookie:auth.startsWith('bot1_session=')?auth:cookie(auth)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
try{
  for(let i=0;i<60;i++){try{if((await call('/api/health')).status===200)break;}catch{}if(i===59)throw new Error('Server did not start: '+output);await new Promise(r=>setTimeout(r,200));}
  assert.equal((await call('/api/overview')).status,401);
  const spoofed=await fetch(`http://127.0.0.1:${port}/api/overview`,{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'owner@example.test'}});assert.equal(spoofed.status,401,'Cloud Run must not trust identity headers');
  const signin=await call('/signin');assert.equal(signin.status,200);const html=await signin.text();const css=html.match(/href="([^\"]+\.css[^\"]*)"/);assert.ok(css,'Signin stylesheet should exist');assert.equal((await call(css[1].replaceAll('&amp;','&'))).status,200,'Standalone static assets should be served');
  assert.equal((await call('/api/auth/password','POST',{password:'short'},'owner@example.test')).status,400);
  const saved=await call('/api/auth/password','POST',{password:'Synthetic first password 🔐'},'owner@example.test');assert.equal(saved.status,200);assert.equal((await saved.json()).ok,true);assert.ok(saved.headers.get('set-cookie').includes('HttpOnly'));assert.ok(members[0].password_hash.startsWith('scrypt$16384$8$5$'));
  assert.equal((await call('/api/auth/login','POST',{email:'owner@example.test',password:'incorrect password'})).status,401);
  const login=await call('/api/auth/login','POST',{email:'owner@example.test',password:'Synthetic first password 🔐'});assert.equal(login.status,200);const ownerCookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/overview','GET',undefined,ownerCookie)).status,200,'A real login cookie must work from another browser');
  assert.equal((await call('/api/auth/password','POST',{password:'Synthetic replacement password'},ownerCookie)).status,403,'Password sessions must supply the current password');
  const changed=await call('/api/auth/password','POST',{currentPassword:'Synthetic first password 🔐',password:'Synthetic replacement password'},ownerCookie);assert.equal(changed.status,200);
  assert.equal((await call('/api/auth/login','POST',{email:'owner@example.test',password:'Synthetic first password 🔐'})).status,401);
  assert.equal((await call('/api/auth/login','POST',{email:'owner@example.test',password:'Synthetic replacement password'})).status,200);
  const logout=await call('/api/auth/logout','POST',{},ownerCookie);assert.equal(logout.status,200);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await call('/api/auth/invite','POST',{email:'expired@example.test',token:inviteToken,password:'Synthetic partner password'})).status,410);
  const activated=await call('/api/auth/invite','POST',{email:'partner@example.test',token:inviteToken,password:'Synthetic partner password'});assert.equal(activated.status,200);const partnerCookie=activated.headers.get('set-cookie').split(';')[0];assert.equal(members[2].invite_token_hash,null);
  assert.equal((await call('/api/auth/invite','POST',{email:'partner@example.test',token:inviteToken,password:'Synthetic partner password'})).status,410,'Invitation links must be single use');
  assert.equal((await call('/api/overview','GET',undefined,partnerCookie)).status,200);assert.equal((await call('/api/settings','PATCH',{monthlyBudgetUsd:100},partnerCookie)).status,403);
  assert.equal((await call('/api/auth/login','POST',{email:'partner@example.test',password:'Synthetic partner password'})).status,200);
  assert.equal((await call('/api/overview','GET',undefined,'viewer@example.test')).status,200);
  assert.equal((await call('/api/run','POST',{count:2},'viewer@example.test')).status,403);
  assert.equal((await call('/api/settings','PATCH',{monthlyBudgetUsd:100},'viewer@example.test')).status,403);
  const invalid=await call('/api/run','POST',{count:101},'owner@example.test');assert.equal(invalid.status,400);
  const queued=await call('/api/run','POST',{count:12,market:'Dentists',locations:'Midrand, South Africa',budgetUsd:.5,callingCode:'27'},'owner@example.test');assert.equal(queued.status,202);assert.equal(runs[0].config.locations,'Midrand, South Africa');assert.equal(runs[0].requested,12);
  assert.equal((await call('/api/jobs/work','POST',{},'viewer@example.test')).status,403);
  const worker=await fetch(`http://127.0.0.1:${port}/api/jobs/work`,{method:'POST',headers:{Authorization:`Bearer ${workerSecret}`}});assert.equal(worker.status,200);
  assert.equal((await call(`/api/run?id=${runs[0].id}`,'DELETE',undefined,'owner@example.test')).status,200);assert.equal(runs[0].status,'canceled');
  const exportResponse=await call('/api/export','GET',undefined,'owner@example.test');assert.equal(exportResponse.status,200);assert.ok((await exportResponse.text()).includes('Test restaurant'));
  workerEnabled=true;
  const discovery=await call('/api/run','POST',{count:2,market:'Restaurants',locations:'Sandton, South Africa',budgetUsd:.5,callingCode:'27'},'owner@example.test');assert.equal(discovery.status,202);const runId=(await discovery.json()).id;
  const run=runs.find(x=>x.id===runId);
  const tick=async()=>{const response=await fetch(`http://127.0.0.1:${port}/api/jobs/work`,{method:'POST',headers:{Authorization:`Bearer ${workerSecret}`}});assert.equal(response.status,200);const result=await response.json();assert.equal(result.error,undefined);return result;};
  await tick();assert.equal(run.status,'running','An empty first search must not end the campaign');assert.equal(run.search_rounds,1);
  await tick();assert.equal(run.status,'running');assert.equal(run.search_rounds,2);
  await tick();assert.equal(run.discovered,2);assert.equal(run.stage,'research');assert.equal(run.search_rounds,3);
  assert.equal(tables.leads.find(x=>x.company_name==='Synthetic directory restaurant').website_url,null,'Unsupported website must not erase a sourced business');
  assert.equal(tables.leads.find(x=>x.company_name==='Synthetic official restaurant').website_url,'https://restaurant-two.example.com/');
  assert.equal(tables.usage_events[2].metadata.discovery.saved,2);assert.equal(tables.usage_events[2].metadata.discovery.unconfirmedWebsites,1);
  assert.equal(tables.usage_events[2].metadata.discovery.providersExcluded,1,'A service vendor is not an ecommerce customer');
  await tick();assert.equal(run.qualified,0);assert.ok(tables.leads.find(x=>x.company_name==='Synthetic directory restaurant').opportunity.officialSearch,'Website lookup must persist separately from analysis');
  await tick();assert.equal(run.qualified,1,'A business-specific search plus listing can establish a missing-site opportunity');
  assert.equal(tables.leads.find(x=>x.company_name==='Synthetic directory restaurant').opportunity.websiteStatus,'not_found');
  await tick();assert.equal(run.qualified,1);assert.equal(run.status,'complete','Search bounds may return fewer qualified prospects');
  const rejected=tables.leads.find(x=>x.company_name==='Synthetic official restaurant');
  assert.equal(rejected.opportunity.status,'not_fit');assert.equal(rejected.status,'reviewed');assert.equal(rejected.draft_body,null);assert.ok(rejected.fit_score<=15);
  const overview=await (await call('/api/overview','GET',undefined,'owner@example.test')).json();assert.ok(overview.leads.some(x=>x.companyName==='Synthetic directory restaurant'),'Saved discoveries must reach the dashboard API');
  assert.equal((await tick()).worked,false);
  const more=await call('/api/run','POST',{count:1,market:'Restaurants',locations:'Sandton, South Africa',budgetUsd:.5,callingCode:'27',focus:'website_gaps'},'owner@example.test');assert.equal(more.status,202);
  const moreId=(await more.json()).id,moreRun=runs.find(x=>x.id===moreId);
  await tick();await tick();assert.equal(moreRun.qualified,0);assert.equal(moreRun.status,'running');assert.equal(moreRun.stage,'discover','Rejecting a good site must resume discovery, not fill the prospect target');
  await tick();await tick();assert.equal(moreRun.qualified,1);assert.equal(moreRun.status,'complete');
  const qualified=tables.leads.find(x=>x.company_name==='Synthetic weak restaurant');assert.equal(qualified.opportunity.service,'Launch');assert.equal(qualified.opportunity.websiteStatus,'weak');assert.equal(qualified.status,'drafted');assert.ok(qualified.phone);
  const exported=await (await call('/api/export','GET',undefined,'owner@example.test')).text();assert.ok(exported.includes('opportunity_status'));assert.ok(exported.includes('Synthetic weak restaurant'));
  console.log('Cloud Run smoke passed: auth/access, campaign controls, bounded empty-search retries, agency exclusions, missing-site lookup, healthy-site rejection, opportunity target continuation, weak-site qualification, saved contacts/drafts and dashboard/CSV results. No external calls made.');
}finally{child.kill('SIGTERM');mock.close();await new Promise(resolve=>child.once('exit',resolve));}
