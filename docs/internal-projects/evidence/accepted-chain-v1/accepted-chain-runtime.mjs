// Independent actual-code composition. All identities/keys are disposable.
// Network adapter invokes the real Finance handler in memory; NOT hosted auth.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runAcceptedTransportCases} from './transport-cases.mjs';
const operationsRoot=resolve(process.env.OPERATIONS_SOURCE_ROOT??'recovery-operations');
const financeRoot=resolve(process.env.FINANCE_SOURCE_ROOT??'recovery-finance-accepted');
const require=createRequire(operationsRoot+'/package.json');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const ts=require('typescript');
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const sourceUri=path=>{let code=readFileSync(path,'utf8');code=code.replace(/from ['"](\.[^'"]+\.ts)['"]/g,(_,relative)=>'from '+JSON.stringify(sourceUri(resolve(dirname(path),relative))));return uri(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);};
const sourceModule=async path=>import(sourceUri(path));
const readF=p=>readFileSync(financeRoot+'/'+p,'utf8');
const candidateFiles=[
 operationsRoot+'/scripts/internal-projects/accepted-personnel-issuer.sql',
 operationsRoot+'/scripts/internal-projects/accepted-personnel-transport.sql',
 operationsRoot+'/supabase/functions/_shared/project-personnel-accepted-transport.ts',
 operationsRoot+'/supabase/functions/_shared/project-personnel-ingestion-transport.ts',
 financeRoot+'/scripts/internal-projects/accepted-cost-receipt.sql',
 financeRoot+'/supabase/functions/_shared/operations-accepted-cost-receive.ts',
];
const fingerprints=()=>candidateFiles.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const sourceFingerprints=fingerprints();
let checks=0;const pass=s=>{checks++;console.log('CHAIN PASS: '+s)};

globalThis.runAcceptedComposition=async odb=>{
 const rows=(await odb.query("select * from operations_economy_private.personnel_accepted_issuances_v1 order by (raw_envelope::jsonb->>'source_revision')::bigint")).rows;
 assert.ok(rows.length>=2,'real issuer fixture must produce two accepted references');
 const envelope=JSON.parse(rows[0].raw_envelope);
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;`);
 const core=readF('supabase/migrations/20260826104657_finance_core_v1.sql');
 await db.exec(core.slice(0,core.indexOf('-- Supplier invoices and many-to-many allocations')));
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
 const org=envelope.destination_organization_id,sourceOrg=envelope.source_organization_id;
 const issuer=envelope.issuer_id,epoch=envelope.enrollment_epoch;
 const secret='synthetic-composition-delivery-key-000001';
 const metadataSecret='synthetic-composition-metadata-key-000002';
 await db.query('insert into finance_organizations(id,name) values($1,$2)',[org,'Synthetic composition']);
 const actor=randomUUID();await db.query('insert into auth.users values($1)',[actor]);
 await db.query("insert into finance_memberships(organization_id,user_id,role_key) values($1,$2,'finance_admin')",[org,actor]);
 await db.query("select set_config('test.user',$1,false)",[actor]);
 await db.query("insert into finance_private.operations_metadata_issuers values('metadata',$1,true)",[metadataSecret]);
 await db.query("insert into finance_private.operations_metadata_tenants values('metadata',$1,$2)",[sourceOrg,org]);
 const projects=new Set(rows.flatMap(r=>JSON.parse(r.raw_envelope).snapshot.lines.map(l=>l.source_project_id)));
 for(const sourceProject of projects){const project=randomUUID();await db.query('insert into finance_projects(id,organization_id,name) values($1,$2,$3)',[project,org,'Synthetic internal project']);await db.query('insert into finance_private.operations_project_map values($1,$2,$3,$4)',[sourceOrg,sourceProject,org,project]);
  await db.query("select finance_enroll_operations_metadata_v1($1,'metadata',$2,$3,1)",[project,sourceOrg,sourceProject]);
  const body={schema:'operations-project-metadata.v1',source_project_id:sourceProject,source_organization_id:sourceOrg,revision:1,operation:'upsert',metadata:{project_kind:'internal_project',declared_project_kind:'internal_project',legacy_is_internal:false,booking_id:null,budget_cost_minor:100000,budget_currency:'SEK'}};
  const fingerprint=(await db.query("select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') f",[JSON.stringify(body)])).rows[0].f;
  const raw=JSON.stringify({...body,fingerprint,captured_at:new Date().toISOString()}),timestamp=String(Date.now()),nonce=randomUUID();
  const signature='v1='+createHmac('sha256',metadataSecret).update(['finance-operations-project-metadata.v1','metadata',timestamp,nonce,raw].join('\n')).digest('hex');
  await db.query('select finance_receive_operations_metadata_v1($1,$2,$3,$4,$5)',['metadata',timestamp,nonce,signature,raw]);
 }
 pass('actual Finance metadata enrollment and signed metadata SQL establish synthetic source bindings');
 await db.query("insert into finance_private.operations_accepted_issuers values($1,$2,$3,$4,'metadata',convert_to($5,'UTF8'),true)",[issuer,epoch,sourceOrg,org,secret]);
 await db.query('select finance_private.enroll_operations_accepted_stream($1,$2,$3,$4)',[issuer,epoch,envelope.source_stream_id,envelope.source_revision-1]);
 const {createAcceptedCostReceiver}=await sourceModule(financeRoot+'/supabase/functions/_shared/operations-accepted-cost-receive.ts');
 const receiverConfig={enabled:true,issuerId:issuer,enrollmentEpoch:epoch,sourceOrganizationId:sourceOrg,destinationOrganizationId:org,secret};
 let rpcCalls=0;const receiver=createAcceptedCostReceiver(receiverConfig,async a=>{rpcCalls++;return (await db.query('select finance_private.receive_operations_accepted_cost($1,$2,$3,$4) r',[a.rawBody,a.timestamp,a.nonce,a.signature])).rows[0].r;});
 // Remaining composition uses the actual Operations dispatch/claim/finish APIs.
 // Their authored candidate must exist; this harness never replaces the transport.
 const sender=await sourceModule(operationsRoot+'/supabase/functions/_shared/project-personnel-accepted-transport.ts');
 await runAcceptedTransportCases({odb,db,rows,envelope,secret,receiver,createAcceptedCostReceiver,receiverConfig,sender,pass,rpcCalls:()=>rpcCalls,operationsRoot});
 await db.close();
 console.log(JSON.stringify({suite:'accepted-chain',checks,backend:'two-isolated-PGlite+actual-TS-handlers',hosted:false,activated:false}));
};

// Reuse the issuer fixture without changing source files or dropping its tests.
// An exact hook retains the real database long enough for cross-module execution.
const issuerTest=pathToFileURL(operationsRoot+'/scripts/internal-projects/personnel-issuer.test.mjs');
let wrapper=readFileSync(issuerTest,'utf8');
wrapper=wrapper.replace("new URL('./accepted-rate-provenance.test.mjs',import.meta.url)",`new URL('./accepted-rate-provenance.test.mjs',${JSON.stringify(issuerTest.href)})`);
const importHook="await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));";
assert.ok(wrapper.includes(importHook),'issuer fixture wrapper changed');
wrapper=wrapper.replace(importHook,`if(!code.includes('await db.close();'))throw new Error('issuer close hook moved');\ncode=code.replace('await db.close();','await globalThis.runAcceptedComposition(db);await db.close();');\n${importHook}`);
await import(uri(wrapper));
assert.deepEqual(fingerprints(),sourceFingerprints,'candidate source changed during composition; rerun stable source');
writeFileSync(new URL('./SOURCE_MANIFEST.json',import.meta.url),JSON.stringify({operationsPublishedBase:'5a0601b6fb2e5aa0cce564ec5a72b77c3c34bb5e',financePublishedBase:'034bc2552cb46987f2c7c45304478d3aacee72b5',candidateFiles:sourceFingerprints,checks,hosted:false},null,2)+'\n');
