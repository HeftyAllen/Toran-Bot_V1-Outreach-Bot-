// Runs the actual standalone server against an isolated in-memory database mock.
// No real credentials, paid requests, live DB writes, or messages are used.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const sessionSecret='synthetic-smoke-test-session-secret-at-least-32-characters';
const workerSecret='synthetic-smoke-test-worker-secret';
const settings={id:1,brand_name:'Toran test',brand_domain:'',target_market:'Restaurants',target_locations:'Sandton, South Africa',services:'Websites',automation_enabled:true,research_limit:3,run_budget_usd:1,monthly_budget_usd:5,whatsapp_unit_cost_usd:null,calling_code:'27'};
const runs=[];const lead={id:'test-lead',company_name:'Test restaurant',website_url:'https://example.com',region:'Sandton',status:'queued',evidence:[],contact_sources:[],do_not_contact:false,fit_score:null,created_at:new Date().toISOString()};
const tables={workspace_settings:[settings],leads:[lead],runs,feedback_events:[],usage_events:[],outreach_messages:[],whatsapp_inbound:[],whatsapp_connection:[]};
const mock=createServer(async(req,res)=>{const url=new URL(req.url,'http://mock');const table=url.pathname.replace('/rest/v1/','');res.setHeader('Content-Type','application/json');let rows;
  if(table==='workspace_members'){const email=(url.searchParams.get('email')??'').replace('eq.','');rows=['owner@example.test','viewer@example.test'].includes(email)?[{email,role:email.startsWith('owner')?'owner':'viewer',created_at:new Date().toISOString()}]:[];}
  else if(table.startsWith('rpc/'))rows=table==='rpc/bot1_usage_summary'?{monthEstimatedUsd:0,monthActualUsd:0,monthReservedUsd:0,allTimeEstimatedUsd:0,allTimeActualUsd:0,unconfirmedCount:0,inputTokens:0,outputTokens:0,searchCalls:0,trackingSince:null}:[];
  else{rows=tables[table]??[];if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');rows.push({...input,processed:0,failed:0,discovered:0,created_at:new Date().toISOString()});rows=[rows.at(-1)];}else if(req.method==='PATCH'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');const id=(url.searchParams.get('id')??'').replace('eq.','');rows=rows.filter(x=>!id||x.id===id);rows.forEach(x=>Object.assign(x,input));}}
  res.end(JSON.stringify(rows));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const dbPort=mock.address().port;const port=4267;
let output='';const child=spawn(process.execPath,['scripts/start-cloud-run.mjs'],{env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),APP_RUNTIME:'cloud-run',SUPABASE_URL:`http://127.0.0.1:${dbPort}`,SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC_TEST',APP_SESSION_SECRET:sessionSecret,APP_ENCRYPTION_SECRET:sessionSecret,WORKER_SECRET:workerSecret,OPENAI_API_KEY:'synthetic-never-used',OWNER_EMAIL:'owner@example.test'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
function cookie(email){const payload=Buffer.from(JSON.stringify({email,expiresAt:Math.floor(Date.now()/1000)+600})).toString('base64url');return `bot1_session=${payload}.${createHmac('sha256',sessionSecret).update(payload).digest('base64url')}`;}
async function call(path,method='GET',body,auth){return fetch(`http://127.0.0.1:${port}${path}`,{method,redirect:'manual',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth?{Cookie:cookie(auth)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
try{
  for(let i=0;i<60;i++){try{if((await call('/api/health')).status===200)break;}catch{}if(i===59)throw new Error('Server did not start: '+output);await new Promise(r=>setTimeout(r,200));}
  assert.equal((await call('/api/overview')).status,401);
  const spoofed=await fetch(`http://127.0.0.1:${port}/api/overview`,{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'owner@example.test'}});assert.equal(spoofed.status,401,'Cloud Run must not trust identity headers');
  const signin=await call('/signin');assert.equal(signin.status,200);const html=await signin.text();const css=html.match(/href="([^\"]+\.css[^\"]*)"/);assert.ok(css,'Signin stylesheet should exist');assert.equal((await call(css[1].replaceAll('&amp;','&'))).status,200,'Standalone static assets should be served');
  assert.equal((await call('/api/overview','GET',undefined,'viewer@example.test')).status,200);
  assert.equal((await call('/api/run','POST',{count:2},'viewer@example.test')).status,403);
  assert.equal((await call('/api/settings','PATCH',{monthlyBudgetUsd:100},'viewer@example.test')).status,403);
  const invalid=await call('/api/run','POST',{count:101},'owner@example.test');assert.equal(invalid.status,400);
  const queued=await call('/api/run','POST',{count:12,market:'Dentists',locations:'Midrand, South Africa',budgetUsd:.5,callingCode:'27'},'owner@example.test');assert.equal(queued.status,202);assert.equal(runs[0].config.locations,'Midrand, South Africa');assert.equal(runs[0].requested,12);
  assert.equal((await call('/api/jobs/work','POST',{},'viewer@example.test')).status,403);
  const worker=await fetch(`http://127.0.0.1:${port}/api/jobs/work`,{method:'POST',headers:{Authorization:`Bearer ${workerSecret}`}});assert.equal(worker.status,200);
  assert.equal((await call(`/api/run?id=${runs[0].id}`,'DELETE',undefined,'owner@example.test')).status,200);assert.equal(runs[0].status,'canceled');
  const exportResponse=await call('/api/export','GET',undefined,'owner@example.test');assert.equal(exportResponse.status,200);assert.ok((await exportResponse.text()).includes('Test restaurant'));
  console.log('Cloud Run smoke passed: standalone assets, login gate, forged-header rejection, viewer restrictions, campaign validation/queue/cancel, worker authentication, CSV export. No external calls made.');
}finally{child.kill('SIGTERM');mock.close();await new Promise(resolve=>child.once('exit',resolve));}
