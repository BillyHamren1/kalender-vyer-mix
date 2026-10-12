// Combined actual-source protocol test. Two isolated PGlite databases; no external HTTP.
// Operations producer + claim + sender handler -> Finance Edge + SQL -> signed ACK + finish.
// Real pgcrypto and Finance authorization/classification SQL, synthetic tenants only.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const financeRoot = process.env.FINANCE_SOURCE_ROOT;
const operationsRoot = process.env.OPERATIONS_SOURCE_ROOT;
if (!financeRoot || !operationsRoot) throw new Error('FINANCE_SOURCE_ROOT and OPERATIONS_SOURCE_ROOT are required absolute local paths');
const require = createRequire(financeRoot + '/package.json');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({extensions:{pgcrypto}});
const read = name => readFileSync(financeRoot + '/supabase/migrations/'+name,'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;`);
const core=read('20260826104657_finance_core_v1.sql');
await db.exec(core.slice(0,core.indexOf('-- Supplier invoices and many-to-many allocations')));
const commands=read('20260826110915_finance_project_commands_v1.sql');
await db.exec(commands.slice(0,commands.indexOf('create or replace function public.finance_command_create_project(')));
await db.exec(`create table finance_customer_invoice_documents(id uuid primary key,organization_id uuid,project_id uuid);
create table finance_customer_commercial_snapshots(id uuid primary key,organization_id uuid,project_id uuid);`);
const classification=read('20261012124248_finance_internal_project_classification_v1.sql');
await db.exec(classification.slice(0,classification.indexOf('create or replace view')));
const close=read('20261012135130_finance_internal_source_activation_guard_v1.sql');
await db.exec(close.slice(0,close.indexOf('create or replace function finance_private.project_financial_close_payload')));
await db.exec(read('20261012155253_finance_operations_metadata_receiver_v1.sql'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),actor=id(2),project=id(3),sourceOrg=id(4),sourceProject=id(5),foreignOrg=id(6),foreignActor=id(7),foreignProject=id(8);
const secret='synthetic-only-key-not-production-00000001',issuer='operations-test';
await db.query(`insert into auth.users values($1),($2)`,[actor,foreignActor]);
await db.query(`insert into finance_organizations(id,name) values($1,'test'),($2,'other')`,[org,foreignOrg]);
await db.query(`insert into finance_memberships(organization_id,user_id,role_key) values($1,$2,'finance_admin'),($3,$4,'finance_admin')`,[org,actor,foreignOrg,foreignActor]);
await db.query(`insert into finance_projects(id,organization_id,name,project_kind) values($1,$2,'test','internal_project'),($3,$4,'other','internal_project'),($5,$2,'legacy',null)`,[project,org,foreignProject,foreignOrg,id(9)]);
let checks=0;
const ok=(name)=>{checks++;console.log('PASS '+name)};
async function deny(fn,pattern){await assert.rejects(fn,pattern);}
const enroll=(p=project,so=sourceOrg,sp=sourceProject)=>db.query(`select finance_enroll_operations_metadata_v1($1,$2,$3,$4,1) id`,[p,issuer,so,sp]);
await db.query(`select set_config('test.user',$1,false)`,[actor]);
await deny(()=>enroll(),/not authorized/); ok('no issuer/tenant provisioned fails closed');
await db.query(`insert into finance_private.operations_metadata_issuers values($1,$2,true)`,[issuer,secret]);
await db.query(`insert into finance_private.operations_metadata_tenants values($1,$2,$3)`,[issuer,sourceOrg,org]);
await db.exec('set role authenticated');
const binding=(await enroll()).rows[0].id;
assert.equal((await enroll()).rows[0].id,binding);ok('authorized existing project enrollment and exact retry');
await deny(()=>enroll(id(9),sourceOrg,id(10)),/Explicit/);ok('legacy classification cannot enroll');
await deny(()=>enroll(project,sourceOrg,id(11)),/immutable/);ok('source cannot be remapped');
await deny(()=>enroll(foreignProject),/manager/);ok('cross-tenant denied by actual can_manage_project');
await db.exec('reset role');
let nonceCounter=0;
async function envelope(revision,overrides={},meta={}) {
 const value={schema:'operations-project-metadata.v1',source_project_id:sourceProject,source_organization_id:sourceOrg,revision,operation:'upsert',metadata:{project_kind:'internal_project',declared_project_kind:'internal_project',legacy_is_internal:false,booking_id:null,budget_cost_minor:10000,budget_currency:'SEK',...meta},...overrides};
 const fp=(await db.query(`select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') fp`,[JSON.stringify(value)])).rows[0].fp;
 return {...value,fingerprint:fp,captured_at:'2026-10-12T15:00:00.000Z'};
}
function signed(e,extra={}) {
 const raw=JSON.stringify(e),timestamp=String(Date.now()),nonce=`synthetic_nonce_${++nonceCounter}`;
 const input={raw,timestamp,nonce,issuer,...extra};
 const message=`finance-operations-project-metadata.v1\n${input.issuer}\n${input.timestamp}\n${input.nonce}\n${input.raw}`;
 return {...input,signature:'v1='+createHmac('sha256',secret).update(message).digest('hex'),...extra};
}
const receive=q=>db.query(`select finance_receive_operations_metadata_v1($1,$2,$3,$4,$5) result`,[q.issuer,q.timestamp,q.nonce,q.signature,q.raw]);
const count=async(table)=>(await db.query(`select count(*)::int n from finance_private.${table}`)).rows[0].n;
const budget=async()=>(await db.query(`select budget_cost_minor::text amount,budget_currency from finance_projects where id=$1`,[project])).rows[0];

const odb=await (async()=>{const db=new PGlite();const org='11111111-1111-4111-8111-111111111111',org2='22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon;create role authenticated;create role service_role;create role restricted;
create schema auth;grant usage on schema auth to authenticated,restricted;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function get_user_organization_id(uuid) returns uuid language sql as $$select $1$$;
create table projects(id uuid primary key,organization_id uuid,name text,project_leader text,booking_id text,is_internal boolean default false,location_id uuid,status text,rigdaydate date,rigdowndate date);
create table bookings(id text primary key,organization_id uuid,client text,status text,is_internal boolean,internal_type text,booking_number text,eventdate date,assigned_to_project boolean);
create table project_billing(id uuid primary key,project_id text,project_type text,organization_id uuid);
create table project_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),organization_id uuid,title text,deadline date,sort_order integer,is_info_only boolean,completed boolean);
create function ensure_internal_lager_booking(uuid) returns text language sql as $$select null::text$$;
alter table projects enable row level security;alter table project_tasks enable row level security;
create policy org_projects on projects for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
create policy org_tasks on project_tasks for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
grant select,insert,update,delete on projects,project_tasks to authenticated;grant select on project_billing,bookings to authenticated;
`);
for(const suffix of ['internal_project_classification.sql','atomic_internal_project_creation.sql','internal_project_metadata_outbox.sql'])await db.exec(readFileSync(operationsRoot + '/supabase/migrations/'+readdirSync(operationsRoot + '/supabase/migrations').find(f=>f.endsWith(suffix)),'utf8'));
return db;})();
await odb.exec(readFileSync(operationsRoot + '/supabase/migrations/20261012155516_internal_project_metadata_delivery.sql','utf8'));

await odb.query("insert into projects(id,organization_id,project_kind,budget_cost_minor,budget_currency) values($1,$2,'internal_project',333333,'SEK')",[sourceProject,sourceOrg]);
const ts=createRequire(operationsRoot + '/package.json')('typescript');
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const helper=uri(transpile(readFileSync(financeRoot + '/supabase/functions/_shared/operations-project-metadata-contract.ts','utf8')));

const env=new Map(Object.entries({OPERATIONS_METADATA_ENABLED:'true',OPERATIONS_METADATA_ISSUER:issuer,OPERATIONS_METADATA_SIGNING_SECRET:secret,SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'}));
let receiver;globalThis.Deno={env:{get:k=>env.get(k)},serve:fn=>receiver=fn};
globalThis.metadataTestClient={rpc:async(name,a)=>{try {await db.exec('SET ROLE service_role');const r=await db.query('select finance_receive_operations_metadata_v1($1,$2,$3,$4,$5) result',[a.p_issuer,a.p_timestamp,a.p_nonce,a.p_signature,a.p_raw_body]);return {data:r.rows[0].result,error:null}}catch(e){return {data:null,error:{message:e.message}}}finally{await db.exec('RESET ROLE')}}};
let edge=readFileSync(financeRoot + '/supabase/functions/operations-project-metadata/index.ts','utf8');
edge=edge.replace('import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";','const createClient=()=>globalThis.metadataTestClient;').replace('../_shared/operations-project-metadata-contract.ts',helper);await import(uri(transpile(edge)));
const sender=await import(uri(transpile(readFileSync(operationsRoot + '/supabase/functions/dispatch-project-metadata/handler.ts','utf8'))));

let httpCalls=0,lose=true;
const senderHandler=sender.createHandler({config:{enabled:true,triggerSecret:secret,issuer,signingSecret:secret,destinationUrl:'https://finance.example.invalid/metadata',allowedUrl:'https://finance.example.invalid/metadata'},
claim:async()=>{await odb.exec('SET ROLE service_role');try{return (await odb.query('select claim_operations_project_metadata_delivery() c')).rows[0].c}finally{await odb.exec('RESET ROLE')}},
finish:async(t,a,f)=>{await odb.exec('SET ROLE service_role');try{return (await odb.query('select finish_operations_project_metadata_delivery($1,$2,$3) ok',[t,a,f])).rows[0].ok}finally{await odb.exec('RESET ROLE')}},
fetch:async(url,init)=>{httpCalls++;const r=await receiver(new Request(url,init));if(lose){lose=false;assert.equal(r.status,200);throw new Error('lost committed response')}return r;}});
const send=()=>senderHandler(new Request('https://ops.example.invalid',{method:'POST',headers:{authorization:'Bearer '+secret}}));
assert.equal((await send()).status,200);assert.equal(httpCalls,0);ok('combined: unconfigured source enrollment yields zero HTTP');
await odb.query('insert into operations_project_metadata_destinations values($1,$2,1,true)',[sourceProject,sourceOrg]);
assert.equal((await send()).status,502);assert.equal(await count('operations_metadata_receipts'),1);assert.equal((await budget()).amount,'333333');ok('combined: actual producer fingerprint + sender signature + receiver SQL commit despite lost response');
await odb.exec("update operations_project_metadata_delivery set next_attempt_at=now()-interval '1 second'");
const retry=await send();assert.equal(retry.status,200);assert.equal((await retry.json()).delivered,true);assert.equal(await count('operations_metadata_receipts'),1);assert.equal((await budget()).amount,'333333');
assert.equal((await odb.query('select count(*)::int n from operations_project_metadata_delivery where delivered_at is not null')).rows[0].n,1);ok('combined: new-nonce retry returns signed ACK verified by sender and DB finish exactly once');
const before=httpCalls;await send();assert.equal(httpCalls,before);ok('combined: completed immutable receipt no further HTTP');
const raw=(await odb.query("select jsonb_build_object('schema',schema_version,'source_project_id',source_project_id,'source_organization_id',source_organization_id,'revision',revision,'operation',operation,'metadata',metadata,'fingerprint',fingerprint,'captured_at',captured_at)::text body from operations_project_metadata_outbox")).rows[0].body;
const timestamp=String(Date.now()),nonce='combined_tamper_nonce_123';const sig=await sender.signature(secret,'finance-operations-project-metadata.v1',issuer,timestamp,nonce,raw);
const h={'x-operations-issuer':issuer,'x-operations-timestamp':timestamp,'x-operations-nonce':nonce,'x-operations-signature':sig};
assert.equal((await receiver(new Request('https://finance.example.invalid',{method:'POST',headers:h,body:raw+' '}))).status,401);ok('combined: transport byte tamper denied');
const foreign=JSON.parse(raw);foreign.source_organization_id=foreignOrg;
foreign.fingerprint=(await db.query("select encode(sha256(convert_to(($1::jsonb-'fingerprint'-'captured_at')::text,'UTF8')),'hex') fp",[JSON.stringify(foreign)])).rows[0].fp;
const fraw=JSON.stringify(foreign),fsig=await sender.signature(secret,'finance-operations-project-metadata.v1',issuer,timestamp,nonce,fraw);
assert.equal((await receiver(new Request('https://finance.example.invalid',{method:'POST',headers:{...h,'x-operations-signature':fsig},body:fraw}))).status,409);assert.equal(await count('operations_metadata_receipts'),1);ok('combined: correctly signed foreign source denied by SQL enrollment');
assert.equal((await db.query('select count(*)::int n from finance_cost_events')).rows[0].n,0);ok('combined: metadata chain creates zero cost facts');
await odb.close();await db.close();
