import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {createHash,randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {runFirstDayFlow} from './first-day-flow.mjs';
import {prepareWriterOracle} from './writer-oracle.mjs';import {prepareInvoiceOracle} from './invoice-oracle.mjs';import {dispatchActualMetadata} from './metadata-oracle.mjs';
export async function runMixedFinance({c,source,records,metadata}){
 const operationsRoot=resolve('.'),financeRoot=resolve(process.env.FINANCE_SOURCE_ROOT??'../recovery-finance-command');
 const require=createRequire(operationsRoot+'/package.json'),{PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto'),ts=require('typescript');
 const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const sourceUri=path=>{let code=readFileSync(path,'utf8');code=code.replace(/from ['"](\.[^'"]+\.ts)['"]/g,(_,relative)=>'from '+JSON.stringify(sourceUri(resolve(dirname(path),relative))));return uri(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)};
 const sourceModule=path=>import(sourceUri(path)),readF=p=>readFileSync(financeRoot+'/'+p,'utf8');
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;`);
 const core=readF('supabase/migrations/20260826104657_finance_core_v1.sql');
 await db.exec(core);
 const commands=readF('supabase/migrations/20260826110915_finance_project_commands_v1.sql');
 await db.exec(commands.slice(0,commands.indexOf('create or replace function public.finance_command_create_project(')));
 const security=readF('supabase/migrations/20260826105013_finance_security_v1.sql');const helper=security.indexOf('create or replace function finance_private.is_org_finance_admin');
 await db.exec(security.slice(helper,security.indexOf('$$;',helper)+3));
 await db.exec('alter table finance_projects add constraint fixture_project_org_unique unique(id,organization_id)');
 await db.exec(readF('scripts/internal-projects/accepted-cost-sources/20261001220213_operations_personnel_cost_shadow_v1.sql'));
 const bound=readF('scripts/internal-projects/accepted-cost-sources/20261001230603_operations_personnel_bound_read_v1.sql');
 await db.exec(bound.slice(0,bound.indexOf('create or replace function finance_private.read_operations_personnel_cost_v1(')));
 await db.exec("alter table finance_projects add column project_kind text default 'internal_project',add column budget_cost_minor bigint,add column budget_currency text");
 await db.exec(readF('supabase/migrations/20261012155253_finance_operations_metadata_receiver_v1.sql'));
 await db.exec(readF('scripts/internal-projects/accepted-cost-receipt.sql'));
 const writer=await prepareWriterOracle(db,financeRoot);
 await db.exec(readF('scripts/internal-projects/customer-identity-metadata.sql'));await db.exec(readF('scripts/internal-projects/customer-cost-booking-text.sql'));
 const e=JSON.parse(records[0].raw_envelope),org=e.destination_organization_id,sourceOrg=e.source_organization_id,issuer=e.issuer_id,epoch=e.enrollment_epoch,actor=randomUUID();
 const secret='synthetic-mixed-cost-delivery-key-000001',metadataSecret='synthetic-mixed-metadata-key-000002';
 await db.query("insert into finance_organizations(id,name) values($1,'Synthetic mixed')",[org]);await db.query('insert into auth.users values($1)',[actor]);await db.query("insert into finance_memberships(organization_id,user_id,role_key) values($1,$2,'finance_admin')",[org,actor]);await db.query("select set_config('test.user',$1,false)",[actor]);
 await db.query("insert into finance_private.operations_metadata_issuers values('metadata',$1,true)",[metadataSecret]);await db.query("insert into finance_private.operations_metadata_tenants values('metadata',$1,$2)",[sourceOrg,org]);
 const destinations=new Map();
 for(const p of source.parts){const id=randomUUID();destinations.set(p.project,id);
  await db.query("insert into finance_projects(id,organization_id,name,project_kind,budget_cost_minor,budget_currency,sold_contract_minor,current_contract_minor) values($1,$2,'Synthetic mixed',$3,777,'SEK',888,999)",[id,org,p.kind]);
  await db.query('insert into finance_private.operations_project_map values($1,$2,$3,$4)',[sourceOrg,p.project,org,id]);
  if(p.kind==='customer'){
   await db.query('insert into finance_private.operations_booking_map values($1,$2,$3)',[sourceOrg,p.booking,p.project]);
   await db.query("select finance_private.enroll_operations_customer_identity_candidate($1,'metadata',$2,$3,$4,1)",[id,sourceOrg,p.project,p.booking]);
  }else await db.query("select finance_enroll_operations_metadata_v1($1,'metadata',$2,$3,1)",[id,sourceOrg,p.project]);

 }
 await writer.installCommand();
 const customer=destinations.get(source.customer),beforeCustomer=await writer.customerState(customer),invoice=await prepareInvoiceOracle(db,financeRoot,{organization:org,project:customer,booking:source.booking});
 await db.query("insert into finance_private.operations_accepted_issuers(issuer_id,enrollment_epoch,source_organization_id,destination_organization_id,metadata_issuer,secret,enabled,metadata_required) values($1,$2,$3,$4,'metadata',convert_to($5,'UTF8'),true,true)",[issuer,epoch,sourceOrg,org,secret]);
 await db.query('select finance_private.enroll_operations_accepted_stream($1,$2,$3,$4)',[issuer,epoch,e.source_stream_id,e.source_revision-1]);
 const {createAcceptedCostReceiver}=await sourceModule(financeRoot+'/supabase/functions/_shared/operations-accepted-cost-receive.ts');
 const receiver=createAcceptedCostReceiver({enabled:true,issuerId:issuer,enrollmentEpoch:epoch,sourceOrganizationId:sourceOrg,destinationOrganizationId:org,secret,metadataRequired:true},async a=>(await db.query('select finance_private.receive_operations_accepted_cost($1,$2,$3,$4) r',[a.rawBody,a.timestamp,a.nonce,a.signature])).rows[0].r);
 const sender=await sourceModule(operationsRoot+'/supabase/functions/_shared/project-personnel-accepted-transport.ts'),endpoint='https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive';

 await c.db.query('insert into operations_economy_private.personnel_accepted_routes_v1 values($1,$2,$3,convert_to($4,\'UTF8\'),true)',[issuer,epoch,endpoint,secret]);
 if(process.env.ACCEPTED_FIRST_DAY==='1')return runFirstDayFlow({c,db,source,records,receiver,writer,invoice,customer,beforeCustomer,destinations,org,operationsRoot,financeRoot,metadataSecret,metadata});
 const claim=async()=> (await c.db.query("select operations_economy_private.claim_accepted_personnel_v1('mixed-oracle',1,120) c")).rows[0]?.c;
 const config={enabled:true,endpoint,issuerId:issuer,enrollmentEpoch:epoch,secret};
 const finish=async(q,r)=>c.db.query('select operations_economy_private.finish_accepted_personnel_v1($1,$2,$3,$4,$5,$6,$7)',[q.id,q.lease_owner,q.lease_token,r.outcome,r.receipt?.raw_ack??null,r.receipt?.signature??null,r.error??null]);
 let q=await claim();assert.ok(q);assert.equal(q.id,records[0].outbox_id);
 const early=await sender.dispatchAcceptedPersonnelClaim(q,config,(url,init)=>receiver(new Request(url,init)));assert.equal(early.outcome,'retry',JSON.stringify(early));assert.equal(early.error,'accepted_http_503');await finish(q,early);assert.equal(await writer.eventCount(),0);
 console.log('MIXED CHAIN PASS cost-before-metadata remains retryable with zero events');
 const delivered=await dispatchActualMetadata({odb:c.db,db,operationsRoot,financeRoot,issuer:'metadata',secret:metadataSecret});assert.equal(delivered,metadata.length);assert.deepEqual(await writer.customerState(customer),beforeCustomer);await invoice.assertUnchanged();
 console.log('MIXED CHAIN PASS actual metadata producer/claim/sender/Edge/SQL/ACK/finish preserves customer and invoices');
 await c.db.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");
 for(let n=0;n<records.length;n++){
  q=await claim();assert.ok(q);assert.equal(q.id,records[n].outbox_id);
  if(n===0){let committedStatus;
   const lost=await sender.dispatchAcceptedPersonnelClaim(q,config,async(url,init)=>{const response=await receiver(new Request(url,init));committedStatus=response.status;throw new Error('synthetic lost committed v2 response')});
   assert.equal(committedStatus,200);assert.equal(lost.outcome,'retry');await finish(q,lost);assert.equal(await writer.eventCount(),0);
   assert.equal((await db.query('select count(*)::int n from finance_private.operations_accepted_receipts')).rows[0].n,1);
   await c.db.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");q=await claim();assert.equal(q.id,records[0].outbox_id);
   console.log('MIXED CHAIN PASS lost committed v2 response stays retryable with one receipt and zero events');
  }
  const result=await sender.dispatchAcceptedPersonnelClaim(q,config,(url,init)=>receiver(new Request(url,init)));assert.equal(result.outcome,'delivered',JSON.stringify(result));await finish(q,result);
  const ack=JSON.parse(result.receipt.raw_ack);assert.equal(ack.financially_applied,false);
  if(n===0)assert.equal(await writer.eventCount(),0);
  await writer.apply(ack.receipt_id,org);const count=await writer.eventCount();await writer.apply(ack.receipt_id,org);assert.equal(await writer.eventCount(),count);
  await writer.denyGeneric();assert.equal(await writer.eventCount(),count);
  const balances=await writer.balances();assert.equal(balances.reduce((sum,x)=>sum+x.actual_minor+x.accrual_minor,0),[240000,180000,0][n]);
  const expected=[[120000,90000,30000],[120000,60000,0],[0,0,0]][n];
  for(let k=0;k<source.parts.length;k++){const b=balances.find(x=>x.project_id===destinations.get(source.parts[k].project));assert.equal(b.actual_minor+b.accrual_minor,expected[k]);}
  assert.deepEqual(await writer.customerState(customer),beforeCustomer);await invoice.assertUnchanged();console.log('MIXED CHAIN PASS real accepted transport/claim/finish and canonical writer exact-once',n,{total:[240000,180000,0][n]});
 }
 assert.equal(await claim(),undefined);await db.close();
}
