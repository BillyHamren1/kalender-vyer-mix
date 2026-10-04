import { createHash, createHmac } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const parent=process.env.STEP8_SERVICE_EXPECTED_PARENT??'efef2c364322a8e5ec83b2d6f57827c05c8157d0';
const parentTree=process.env.STEP8_SERVICE_EXPECTED_PARENT_TREE??'32fc630a7b3f1cb09cfbf8e7f17efc602b62d282';
const owned=[
  '.github/workflows/project-economy-step8-service-read.yml',
  'scripts/project-economy/step8-service-read-runtime.mjs',
  'supabase/functions/_shared/project-economy-step8-service-read-contract.ts',
  'supabase/functions/project-economy-step8-service-read/handler.deno-test.ts',
  'supabase/functions/project-economy-step8-service-read/handler.ts',
  'supabase/functions/project-economy-step8-service-read/index.ts',
  'supabase/migrations/20261004004000_project_economy_step8_service_read_v1.sql',
];
const run=(file,args=[],options={})=>execFileSync(file,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const lines=value=>value.trim().split('\n').filter(Boolean).sort();
if(run('git',['rev-parse','HEAD^']).trim()!==parent) throw new Error('service_parent_mismatch');
if(run('git',['rev-parse',`${parent}^{tree}`]).trim()!==parentTree) throw new Error('service_parent_tree_mismatch');
if(run('git',['rev-list','--count',`${parent}..HEAD`]).trim()!=='1') throw new Error('service_non_linear_successor');
if(JSON.stringify(lines(run('git',['diff','--name-only',parent,'HEAD'])))!==JSON.stringify(owned)) throw new Error('service_owned_paths_mismatch');
if(run('git',['status','--porcelain']).trim()) throw new Error('service_tree_not_clean');

const migrationPath='supabase/migrations/20261004004000_project_economy_step8_service_read_v1.sql';
const migration=readFileSync(migrationPath,'utf8');
const required=[
  "security definer set search_path=''","grant execute on function public.read_project_economy_step8_service_v1(text,jsonb) to anon",
  'revoke all on schema operations_step8_service_private from public,anon,authenticated,service_role',
  'eventflow.finance.operations-project-economy-read-request.v1','eventflow.operations.project-economy-read-response.v1',
  'eventflow-project-economy-step8-read.v1','pg_advisory_xact_lock','receipt_found:=found',
  "source_count<1 or source_count>50","octet_length(p_raw_body)>4096","octet_length(payload_raw)>262144",
  "octet_length(response_raw)>307200","raise exception 'step8_service_request_authentication_failed' using errcode='28000'",
  "raise exception 'step8_service_tuple_not_enrolled' using errcode='42501'",
];
for(const marker of required) if(!migration.includes(marker)) throw new Error(`service_static_marker_missing:${marker}`);
if(/insert\s+into\s+operations_step8_service_private\.(request_keys|response_keys|enrollments)/i.test(migration)) {
  throw new Error('service_committed_key_or_enrollment');
}
const migrationSha256=createHash('sha256').update(migration).digest('hex');
if(process.env.STEP8_SERVICE_STATIC_ONLY==='1') {
  console.log(JSON.stringify({status:'PASS',mode:'static-only',parent,parentTree,owned,migrationSha256},null,2));
  process.exit(0);
}

const databaseUrl=process.env.STEP8_SERVICE_DATABASE_URL;
if(!databaseUrl) throw new Error('STEP8_SERVICE_DATABASE_URL_required');
if(process.env.STEP8_PROJECTOR_RUNTIME_ACK!=='STEP8_RUNTIME_PASS') throw new Error('projector_runtime_ack_missing');
const psql=(sql)=>run('psql',[databaseUrl,'-XAt','--no-password','-v','ON_ERROR_STOP=1'],{
  input:sql,env:{...process.env,PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000'},
  maxBuffer:16*1024*1024,
});
psql(`\\set ON_ERROR_STOP on\n\\i ${migrationPath}\n`);

const destOrg='10000000-0000-4000-8000-000000000002';
const destProject='20000000-0000-4000-8000-000000000002';
const sourceOrg='10000000-0000-4000-8000-000000000001';
const sourceProject='20000000-0000-4000-8000-000000000001';
const requestKid='finreq01',responseKid='opsresp01';
const requestSecret=Buffer.alloc(32,0x11),responseSecret=Buffer.alloc(32,0x22);
const sourceFingerprint='a'.repeat(64),actorHash='b'.repeat(64);
psql(`
insert into operations_step8_service_private.request_keys values
 ('eventflow-finance','eventflow-operations-project-economy-step8','${requestKid}',1,decode('${requestSecret.toString('hex')}','hex'),now()-interval '1 hour',now()+interval '1 day',null);
insert into operations_step8_service_private.response_keys values
 ('eventflow-operations','eventflow-finance-project-economy-step8','${responseKid}',1,decode('${responseSecret.toString('hex')}','hex'),now()-interval '1 hour',now()+interval '1 day',null);
insert into operations_step8_service_private.enrollments(
 issuer,audience,request_key_id,request_key_version,destination_organization_id,destination_project_id,
 source_organization_id,source_project_id,method,route,protocol,response_issuer,response_audience,response_key_id,
 response_key_version,enabled,not_before,expires_at,revoked_at)
values('eventflow-finance','eventflow-operations-project-economy-step8','${requestKid}',1,'${destOrg}','${destProject}',
 '${sourceOrg}','${sourceProject}','POST','/functions/v1/project-economy-step8-service-read',
 'eventflow-project-economy-step8-read.v1','eventflow-operations','eventflow-finance-project-economy-step8',
 '${responseKid}',1,true,now()-interval '1 hour',now()+interval '1 day',null);
`);

const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>{
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
let sequence=1;
const nonceFor=n=>Buffer.alloc(32,n%256).toString('base64url');
const request=(overrides={})=>{
  const now=Math.floor(Date.now()/1000);
  const body={actorSubjectHash:actorHash,audience:'eventflow-operations-project-economy-step8',authCheckedAt:now-1,
    destinationOrganizationId:destOrg,destinationProjectId:destProject,expiresAt:now+45,issuedAt:now,
    issuer:'eventflow-finance',mappingBasis:'finance_local_current_component_map',nonce:nonceFor(sequence++),operation:'read',
    requestId:`90000000-0000-4000-8000-${String(sequence).padStart(12,'0')}`,schemaVersion:'eventflow.finance.operations-project-economy-read-request.v1',
    shadowOnly:true,sourceCount:3,sourceOrganizationId:sourceOrg,sourceProjectId:sourceProject,
    sourceSetFingerprint:sourceFingerprint,...overrides.body};
  const raw=overrides.raw??canonical(body);const bodyHash=sha(raw);
  const headers={method:'POST',route:'/functions/v1/project-economy-step8-service-read',protocol:'eventflow-project-economy-step8-read.v1',
    issuer:'eventflow-finance',audience:'eventflow-operations-project-economy-step8',requestKeyId:requestKid,requestKeyVersion:1,
    requestId:body.requestId,nonce:body.nonce,issuedAt:body.issuedAt,expiresAt:body.expiresAt,bodySha256:bodyHash,
    actorSubjectHash:body.actorSubjectHash,authCheckedAt:body.authCheckedAt,...overrides.headers};
  const frame=['hmac-sha256',headers.protocol,headers.method,headers.route,headers.issuer,headers.audience,headers.requestKeyId,
    String(headers.requestKeyVersion),headers.requestId,headers.nonce,String(headers.issuedAt),String(headers.expiresAt),
    headers.bodySha256,headers.actorSubjectHash,String(headers.authCheckedAt)].join('\n');
  headers.signature=`hmac-sha256=${createHmac('sha256',requestSecret).update(frame).digest('hex')}`;
  if(overrides.signature) headers.signature=overrides.signature;
  return {body,raw,headers};
};
const b64=value=>Buffer.from(value).toString('base64');
const callSql=req=>`set role anon;select public.read_project_economy_step8_service_v1(convert_from(decode('${b64(req.raw)}','base64'),'UTF8'),convert_from(decode('${b64(JSON.stringify(req.headers))}','base64'),'UTF8')::jsonb);reset role;`;
const call=req=>JSON.parse(psql(callSql(req)).trim().split('\n').filter(x=>x.startsWith('{')).at(-1));
const verifyEnvelope=(envelope,req)=>{
 const h=envelope.responseHeaders;if(sha(envelope.rawBody)!==h.bodySha256||h.requestBodySha256!==sha(req.raw)||h.requestNonceSha256!==sha(req.body.nonce)) throw new Error('response_hash_binding_failed');
 const frame=['hmac-sha256',h.protocol,h.issuer,h.audience,h.responseKeyId,String(h.responseKeyVersion),h.requestId,h.nonce,
  String(h.issuedAt),String(h.expiresAt),h.bodySha256,h.requestBodySha256,h.requestNonceSha256].join('\n');
 if(createHmac('sha256',responseSecret).update(frame).digest('hex')!==h.signature) throw new Error('response_hmac_failed');
};
const expectState=(req,state)=>psql(`set role anon;do $test$begin perform public.read_project_economy_step8_service_v1(
 convert_from(decode('${b64(req.raw)}','base64'),'UTF8'),convert_from(decode('${b64(JSON.stringify(req.headers))}','base64'),'UTF8')::jsonb);
 raise exception 'expected_${state}';exception when sqlstate '${state}' then null;end$test$;reset role;`);
const receiptCount=()=>Number(psql('select count(*) from operations_step8_service_private.receipts;').trim());
const domainFingerprint=()=>psql(`select encode(sha256(convert_to(concat_ws('|',
 (select count(*)::text from public.operations_personnel_cost_streams),
 (select count(*)::text from public.operations_personnel_cost_publications),
 (select count(*)::text from public.operations_finance_invoice_streams),
 (select count(*)::text from public.operations_finance_invoice_snapshots),
 (select count(*)::text from public.operations_finance_credit_v2_streams),
 (select count(*)::text from public.operations_finance_credit_v2_snapshots),
 (select coalesce(md5(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text)),'') from public.operations_personnel_cost_publications t),
 (select coalesce(md5(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text)),'') from public.operations_finance_invoice_snapshots t),
 (select coalesce(md5(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text)),'') from public.operations_finance_credit_v2_snapshots t)
),'UTF8')),'hex');`).trim();

// The parent projector runtime leaves one synthetic source conflict so the
// authenticated signed-domain failure can be proved before restoring availability.
let domainBefore=domainFingerprint(),receiptsBefore=receiptCount();
const conflictReq=request();const conflict=call(conflictReq);verifyEnvelope(conflict,conflictReq);
if(conflict.status!==409||JSON.parse(conflict.rawBody).outcome!=='unavailable') throw new Error('signed_source_conflict_failed');
if(domainFingerprint()!==domainBefore||receiptCount()!==receiptsBefore+1) throw new Error('conflict_domain_writes_or_receipt_count_failed');
psql(`delete from public.operations_finance_credit_v2_snapshots where invoice_id='70000000-0000-4000-8000-000000000005';
delete from public.operations_finance_credit_v2_streams where invoice_id='70000000-0000-4000-8000-000000000005';
delete from public.operations_finance_invoice_snapshots where invoice_id='70000000-0000-4000-8000-000000000005';
delete from public.operations_finance_invoice_streams where invoice_id='70000000-0000-4000-8000-000000000005';`);
domainBefore=domainFingerprint();receiptsBefore=receiptCount();
const availableReq=request();const available=call(availableReq);verifyEnvelope(available,availableReq);const availableBody=JSON.parse(available.rawBody);
const payloadKeys=['authority','authoritativeTotals','coverage','exceptions','financeRecalculated','generatedAt','invoices',
 'organizationId','personnel','projectId','replacesLegacyTotals','schema','shadowOnly'];
if(available.status!==200||availableBody.outcome!=='available'||availableBody.payload?.schema!=='operations-project-economy-step8-shadow.v1'||
 JSON.stringify(Object.keys(availableBody.payload??{}).sort())!==JSON.stringify(payloadKeys)||
 availableBody.payload?.financeRecalculated!==false||availableBody.payload?.authoritativeTotals!==false||
 availableBody.payload?.replacesLegacyTotals!==false||availableBody.payload?.shadowOnly!==true) throw new Error('available_shadow_payload_failed');
if(!availableBody.payload.personnel.some(row=>row.amountMinor===null)) throw new Error('missing_rate_null_lost');
if(!availableBody.payload.invoices.some(row=>row.creditRelationCoverage==='linked'&&typeof row.creditRelationshipFingerprint==='string')) throw new Error('linked_credit_lost');
if(sha(canonical(availableBody.payload))!==availableBody.payloadSha256) throw new Error('payload_fingerprint_failed');
if(domainFingerprint()!==domainBefore||receiptCount()!==receiptsBefore+1) throw new Error('available_domain_writes_or_receipt_count_failed');

const concurrentReq=request();
receiptsBefore=receiptCount();
const concurrent=await Promise.all(Array.from({length:16},()=>new Promise((resolve,reject)=>{
 const child=spawn('psql',[databaseUrl,'-XAt','--no-password','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'}});
 let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);
 child.on('close',code=>code?reject(new Error(`concurrent_psql_${code}:${err}`)):resolve(JSON.parse(out.trim().split('\n').filter(x=>x.startsWith('{')).at(-1))));
 child.stdin.end(callSql(concurrentReq));
})));
if(new Set(concurrent.map(x=>`${x.status}\n${x.rawBody}\n${canonical(x.responseHeaders)}`)).size!==1) throw new Error('concurrent_replay_not_byte_identical');
verifyEnvelope(concurrent[0],concurrentReq);
if(receiptCount()!==receiptsBefore+1) throw new Error('concurrent_receipt_count_failed');
const replay=call(concurrentReq);
if(replay.rawBody!==concurrent[0].rawBody||canonical(replay.responseHeaders)!==canonical(concurrent[0].responseHeaders)) throw new Error('serial_replay_not_byte_identical');
if(receiptCount()!==receiptsBefore+1) throw new Error('replay_created_receipt');

const beforeInvalid=receiptCount();
expectState(request({signature:'hmac-sha256='+'0'.repeat(64)}),'28000');
const actorSwap=request();actorSwap.headers.actorSubjectHash='c'.repeat(64);expectState(actorSwap,'28000');
const idSwap=request();idSwap.headers.requestId='90000000-0000-4000-8000-999999999999';expectState(idSwap,'28000');
expectState(request({body:{sourceProjectId:'20000000-0000-4000-8000-000000000003'}}),'42501');
const tooLong=request({body:{expiresAt:Math.floor(Date.now()/1000)+61}});expectState(tooLong,'22023');
const future=request({body:{issuedAt:Math.floor(Date.now()/1000)+6,authCheckedAt:Math.floor(Date.now()/1000)+5,expiresAt:Math.floor(Date.now()/1000)+50}});expectState(future,'28000');
const duplicate=request();duplicate.raw=duplicate.raw.replace('{','{"actorSubjectHash":"'+actorHash+'",');duplicate.headers.bodySha256=sha(duplicate.raw);expectState(duplicate,'22023');
if(receiptCount()!==beforeInvalid) throw new Error('invalid_requests_wrote_receipts');

const collisionBase=request();const collisionStored=call(collisionBase);verifyEnvelope(collisionStored,collisionBase);receiptsBefore=receiptCount();
const collision=request({body:{nonce:collisionBase.body.nonce}});expectState(collision,'23505');
if(receiptCount()!==receiptsBefore) throw new Error('nonce_collision_created_receipt');
const collisionOriginal=call(collisionBase);verifyEnvelope(collisionOriginal,collisionBase);
if(collisionOriginal.rawBody!==collisionStored.rawBody||canonical(collisionOriginal.responseHeaders)!==canonical(collisionStored.responseHeaders)) throw new Error('nonce_collision_mutated_original_receipt');
const revokeReplay=request();call(revokeReplay);
psql(`update operations_step8_service_private.request_keys set revoked_at=now() where key_id='${requestKid}';`);
expectState(revokeReplay,'28000');psql(`update operations_step8_service_private.request_keys set revoked_at=null where key_id='${requestKid}';`);
psql(`update operations_step8_service_private.response_keys set revoked_at=now() where key_id='${responseKid}';`);
expectState(revokeReplay,'42501');psql(`update operations_step8_service_private.response_keys set revoked_at=null where key_id='${responseKid}';`);
psql(`update operations_step8_service_private.response_keys set secret=decode('${requestSecret.toString('hex')}','hex') where key_id='${responseKid}';`);
expectState(revokeReplay,'42501');
psql(`update operations_step8_service_private.response_keys set secret=decode('${responseSecret.toString('hex')}','hex') where key_id='${responseKid}';`);
psql(`update operations_step8_service_private.enrollments set revoked_at=now();`);expectState(revokeReplay,'42501');
psql(`update operations_step8_service_private.enrollments set revoked_at=null;`);

domainBefore=domainFingerprint();receiptsBefore=receiptCount();
const cleanupNonce=nonceFor(240);
psql(`insert into operations_step8_service_private.receipts(request_issuer,request_key_id,nonce,request_audience,
 request_key_version,request_body_sha256,raw_request,destination_organization_id,destination_project_id,
 source_organization_id,source_project_id,source_set_fingerprint,source_count,response_status,raw_response,response_headers,created_at)
values('eventflow-finance','${requestKid}','${cleanupNonce}','eventflow-operations-project-economy-step8',1,
 '${'d'.repeat(64)}','{}','${destOrg}','${destProject}','${sourceOrg}','${sourceProject}','${sourceFingerprint}',3,200,'{}',
 jsonb_build_object('expiresAt',1),now()-interval '2 days');`);
if(receiptCount()!==receiptsBefore+1) throw new Error('cleanup_fixture_insert_failed');
const cleaned=Number(psql(`select operations_step8_service_private.cleanup_expired_receipts_v1(now()-interval '1 day');`).trim());
if(cleaned!==1||receiptCount()!==receiptsBefore||domainFingerprint()!==domainBefore) throw new Error('owner_cleanup_failed_or_domain_wrote');
psql(`do $test$begin delete from operations_step8_service_private.receipts where request_issuer='eventflow-finance';
 raise exception 'receipt_delete_was_allowed';exception when sqlstate '55000' then null;end$test$;
do $test$begin truncate operations_step8_service_private.receipts;
 raise exception 'receipt_truncate_was_allowed';exception when sqlstate '55000' then null;end$test$;`);

// Service boundary at exactly 500 and 501 personnel rows (two base rows exist).
psql(`insert into public.operations_personnel_cost_streams values('${sourceOrg}','service-limit-bulk',1);
insert into public.operations_personnel_cost_publications
select '${sourceOrg}','service-limit-bulk',1,'40000000-0000-4000-8000-000000000020',1,
 jsonb_build_object('work_date','2026-10-04','lines',jsonb_agg(jsonb_build_object('source_time_line_id','svc-'||lpad(g::text,3,'0'),
 'source_project_id','${sourceProject}','source_booking_id',null,'minutes',1,'amount_minor',1,'currency','SEK','status','preliminary','coverage','complete') order by g))
from generate_series(1,498) g;`);
if(call(request()).status!==200) throw new Error('service_exact_500_failed');
psql(`insert into public.operations_personnel_cost_streams values('${sourceOrg}','service-limit-overflow',1);
insert into public.operations_personnel_cost_publications values('${sourceOrg}','service-limit-overflow',1,
'40000000-0000-4000-8000-000000000021',1,jsonb_build_object('work_date','2026-10-04','lines',jsonb_build_array(
jsonb_build_object('source_time_line_id','svc-overflow','source_project_id','${sourceProject}','source_booking_id',null,
'minutes',1,'amount_minor',1,'currency','SEK','status','preliminary','coverage','complete'))));`);
const overflow=call(request());if(overflow.status!==409||JSON.parse(overflow.rawBody).outcome!=='unavailable') throw new Error('service_501_failed');

const acl=psql(`select has_function_privilege('anon','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_function_privilege('authenticated','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_function_privilege('service_role','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_schema_privilege('anon','operations_step8_service_private','USAGE'),
has_table_privilege('anon','operations_step8_service_private.receipts','SELECT'),
has_function_privilege('anon','operations_step8_service_private.cleanup_expired_receipts_v1(timestamptz)','EXECUTE');`).trim();
if(acl!=='t|f|f|f|f|f') throw new Error(`service_acl_failed:${acl}`);
console.log(JSON.stringify({status:'PASS',schema:'eventflow.operations.project-economy-read-response.v1',migrationSha256,
 postgresRuntime:true,assertions:{parentProjectorRuntime:true,signedConflict:true,availableExactProjector:true,missingRateNull:true,
 linkedCredit:true,financeFlagsFalse:true,concurrentReplay16:true,byteIdenticalReplay:true,
 invalidSignatureWrites0:true,actorRequestIdSwapDenied:true,crossTupleDenied:true,ttlFutureDenied:true,duplicateCanonicalDenied:true,
 nonceCollisionUnsigned23505:true,receiptImmutable:true,ownerExpiredCleanup:true,
 requestResponseEnrollmentRevocationDenied:true,directionalKeySeparation:true,exact500:true,overflow501Unavailable:true,
 anonOnlyExecute:true,privateDirectSelectDenied:true}},null,2));
