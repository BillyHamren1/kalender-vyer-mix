import { createHash, createHmac } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const parent=process.env.STEP8_SERVICE_EXPECTED_PARENT??'574beeb04eed0f1f6de794fcd87d213c3830c830';
const parentTree=process.env.STEP8_SERVICE_EXPECTED_PARENT_TREE??'6bdca494c9872991d0d18047f4db4de59b36189f';
const predecessor='767e320e8a673254fd50f33371dca2a0770ab7da';
const predecessorTree='305f8a8c4a3f27cdeb23252316994b8d5f533113';
const serviceKeyOrderBase='2be1998c85c282046cc8d2be2446c894ea47eb3e';
const serviceKeyOrderBaseTree='e19fb55dd6e8976827271a085ba4d1ce564813cd';
const serviceRepairBase='e5b8790b591c740beee1ebd7f0e875ed51a99cb3';
const serviceRepairBaseTree='ba796c50f0d7ab1237a660ee592940f21ad80f25';
const serviceFoundation='ddde377f239f276a19cde807c000bbadd5868389';
const serviceFoundationTree='3874de6f17ff70d7cb00d75c85f9f9dc3385ac29';
const serviceBootstrap='efef2c364322a8e5ec83b2d6f57827c05c8157d0';
const serviceBootstrapTree='32fc630a7b3f1cb09cfbf8e7f17efc602b62d282';
const owned=[
  '.github/workflows/project-economy-step8-service-read.yml',
  'scripts/project-economy/step8-service-read-runtime.mjs',
];
const run=(file,args=[],options={})=>execFileSync(file,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const lines=value=>value.trim().split('\n').filter(Boolean).sort();
if(run('git',['rev-parse','HEAD^']).trim()!==parent) throw new Error('service_parent_mismatch');
if(run('git',['rev-parse',`${parent}^{tree}`]).trim()!==parentTree) throw new Error('service_parent_tree_mismatch');
if(run('git',['rev-parse',`${parent}^`]).trim()!==predecessor||
 run('git',['rev-parse',`${predecessor}^{tree}`]).trim()!==predecessorTree||
 run('git',['rev-parse',`${predecessor}^`]).trim()!==serviceKeyOrderBase||
 run('git',['rev-parse',`${serviceKeyOrderBase}^{tree}`]).trim()!==serviceKeyOrderBaseTree||
 run('git',['rev-parse',`${serviceKeyOrderBase}^`]).trim()!==serviceRepairBase||
 run('git',['rev-parse',`${serviceRepairBase}^{tree}`]).trim()!==serviceRepairBaseTree||
 run('git',['rev-parse',`${serviceRepairBase}^`]).trim()!==serviceFoundation||
 run('git',['rev-parse',`${serviceFoundation}^{tree}`]).trim()!==serviceFoundationTree||
 run('git',['rev-parse',`${serviceFoundation}^`]).trim()!==serviceBootstrap||
 run('git',['rev-parse',`${serviceBootstrap}^{tree}`]).trim()!==serviceBootstrapTree) {
  throw new Error('service_lineage_mismatch');
}
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
  'create function operations_step8_service_private.canonical_json_v1(p_value jsonb)',
  "returns text language plpgsql immutable strict security invoker set search_path=''",
  'revoke all on function operations_step8_service_private.canonical_json_v1(jsonb)\n from public,anon,authenticated,service_role',
  'create function operations_step8_service_private.json_depth_within_v1(',
  ") returns boolean language plpgsql immutable strict security invoker set search_path=''",
  'revoke all on function operations_step8_service_private.json_depth_within_v1(jsonb,integer,integer)\n from public,anon,authenticated,service_role',
  'operations_step8_service_private.json_depth_within_v1(payload,1,8)',
  '(select count(*) from jsonb_object_keys(payload))<>13',
  "jsonb_typeof(payload->'schema')<>'string'",
  '(select count(*) from jsonb_object_keys(response_body))<>18',
  'step8_service_projector_payload_invalid',
  "jsonb_typeof(p_headers->'signature')<>'string'",
  "personnel_row.row_value->>'minutes'!~'^(0|[1-9][0-9]{0,15})$'",
  "invoice_row.row_value->>'sourceEconomicRevision'!~'^[1-9][0-9]{0,15}$'",
  "payload->'generatedAt' is distinct from to_jsonb(now())",
  "finance-invoice-allocation-source-anchor-v1",
  'expected_counts expected_row full join actual_counts actual_row',
  "invoice_row.row_value->>'sourceProtocol'='v2' and (",
  "count(distinct jsonb_build_array(sibling->'sourceOrganizationId'",
  'lag(work_date) over(order by ord)',
  "::numeric=trunc((invoice_row.row_value->>'amountMinor')::numeric)",
];
for(const marker of required) if(!migration.includes(marker)) throw new Error(`service_static_marker_missing:${marker}`);
if(migration.includes('operations_economy_private.canonical_json_v1(payload)')||
 migration.includes('operations_economy_private.canonical_json_v1(response_body)')||
 /grant\s+execute\s+on\s+function\s+operations_step8_service_private\.canonical_json_v1/i.test(migration)) {
  throw new Error('service_private_canonical_boundary_failed');
}
if(/insert\s+into\s+operations_step8_service_private\.(request_keys|response_keys|enrollments)/i.test(migration)) {
  throw new Error('service_committed_key_or_enrollment');
}
const migrationSha256=createHash('sha256').update(migration).digest('hex');
if(process.env.STEP8_SERVICE_STATIC_ONLY==='1') {
  console.log(JSON.stringify({status:'PASS',mode:'static-only',parent,parentTree,predecessor,predecessorTree,
    serviceKeyOrderBase,serviceKeyOrderBaseTree,serviceRepairBase,serviceRepairBaseTree,serviceFoundation,serviceFoundationTree,serviceBootstrap,
    serviceBootstrapTree,owned,migrationSha256},null,2));
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
const canonicalProc=psql(`select count(*)=1,
 bool_and(oidvectortypes(p.proargtypes)='jsonb'),bool_and(p.provolatile='i'),bool_and(p.proisstrict),
 bool_and(not p.prosecdef),bool_and(coalesce(array_to_string(p.proconfig,','),'')='search_path=""'),
 bool_and(pg_get_userbyid(p.proowner)=current_user),bool_and(p.prorettype='text'::regtype),bool_and(l.lanname='plpgsql')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='operations_step8_service_private' and p.proname='canonical_json_v1';`).trim();
if(canonicalProc!=='t|t|t|t|t|t|t|t|t') throw new Error(`canonical_proc_contract_failed:${canonicalProc}`);
const depthProc=psql(`select count(*)=1,
 bool_and(oidvectortypes(p.proargtypes)='jsonb, integer, integer'),bool_and(p.provolatile='i'),bool_and(p.proisstrict),
 bool_and(not p.prosecdef),bool_and(coalesce(array_to_string(p.proconfig,','),'')='search_path=""'),
 bool_and(pg_get_userbyid(p.proowner)=current_user),bool_and(p.prorettype='boolean'::regtype),bool_and(l.lanname='plpgsql')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='operations_step8_service_private' and p.proname='json_depth_within_v1';`).trim();
if(depthProc!=='t|t|t|t|t|t|t|t|t') throw new Error(`depth_proc_contract_failed:${depthProc}`);
const canonicalAcl=psql(`with target as(
 select p.oid,p.proacl,p.proowner,n.oid schema_oid,n.nspacl,n.nspowner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='operations_step8_service_private' and p.proname='canonical_json_v1'
) select
 not exists(select 1 from target t cross join lateral aclexplode(coalesce(t.proacl,acldefault('f',t.proowner))) a
   where a.grantee=0 and a.privilege_type='EXECUTE'),
 not has_function_privilege('anon','operations_step8_service_private.canonical_json_v1(jsonb)','EXECUTE'),
 not has_function_privilege('authenticated','operations_step8_service_private.canonical_json_v1(jsonb)','EXECUTE'),
 not has_function_privilege('service_role','operations_step8_service_private.canonical_json_v1(jsonb)','EXECUTE'),
 not exists(select 1 from target t cross join lateral aclexplode(coalesce(t.nspacl,acldefault('n',t.nspowner))) a
   where a.grantee=0 and a.privilege_type='USAGE'),
 not has_schema_privilege('anon','operations_step8_service_private','USAGE'),
 not has_schema_privilege('authenticated','operations_step8_service_private','USAGE'),
 not has_schema_privilege('service_role','operations_step8_service_private','USAGE');`).trim();
if(canonicalAcl!=='t|t|t|t|t|t|t|t') throw new Error(`canonical_acl_failed:${canonicalAcl}`);
const depthAcl=psql(`with target as(
 select p.oid,p.proacl,p.proowner,n.oid schema_oid,n.nspacl,n.nspowner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='operations_step8_service_private' and p.proname='json_depth_within_v1'
) select
 not exists(select 1 from target t cross join lateral aclexplode(coalesce(t.proacl,acldefault('f',t.proowner))) a
   where a.grantee=0 and a.privilege_type='EXECUTE'),
 not has_function_privilege('anon','operations_step8_service_private.json_depth_within_v1(jsonb,integer,integer)','EXECUTE'),
 not has_function_privilege('authenticated','operations_step8_service_private.json_depth_within_v1(jsonb,integer,integer)','EXECUTE'),
 not has_function_privilege('service_role','operations_step8_service_private.json_depth_within_v1(jsonb,integer,integer)','EXECUTE'),
 not exists(select 1 from target t cross join lateral aclexplode(coalesce(t.nspacl,acldefault('n',t.nspowner))) a
   where a.grantee=0 and a.privilege_type='USAGE'),
 not has_schema_privilege('anon','operations_step8_service_private','USAGE'),
 not has_schema_privilege('authenticated','operations_step8_service_private','USAGE'),
 not has_schema_privilege('service_role','operations_step8_service_private','USAGE');`).trim();
if(depthAcl!=='t|t|t|t|t|t|t|t') throw new Error(`depth_acl_failed:${depthAcl}`);
for(const role of ['anon','authenticated','service_role']){
 psql(`set role ${role};do $test$begin
  begin perform operations_step8_service_private.canonical_json_v1('{}'::jsonb);
   raise exception 'canonical_helper_was_allowed';exception when insufficient_privilege then null;end;
  begin perform operations_step8_service_private.json_depth_within_v1('{}'::jsonb,1,8);
   raise exception 'depth_helper_was_allowed';exception when insufficient_privilege then null;end;
 end$test$;reset role;`);
}

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
const canonicalVectorPath=process.env.STEP8_SERVICE_CANONICAL_VECTOR_PATH;
if(!canonicalVectorPath) throw new Error('STEP8_SERVICE_CANONICAL_VECTOR_PATH_required');
const canonicalVectors=JSON.parse(readFileSync(canonicalVectorPath,'utf8'));
if(!Array.isArray(canonicalVectors)||canonicalVectors.length!==4) throw new Error('production_canonical_vectors_invalid');
for(const vector of canonicalVectors){
 if(!vector||typeof vector.name!=='string'||typeof vector.raw!=='string'||typeof vector.expected!=='string'||
  typeof vector.sha256!=='string'||!/^[0-9a-f]{64}$/.test(vector.sha256)) throw new Error('production_canonical_vector_invalid');
 const actual=psql(`select operations_step8_service_private.canonical_json_v1($vector$${vector.raw}$vector$::jsonb);`).trim();
 if(actual!==vector.expected||sha(actual)!==vector.sha256) {
  throw new Error(`canonical_vector_failed:${vector.name}:${actual}`);
 }
}
if(psql(`select operations_step8_service_private.canonical_json_v1(null::jsonb) is null;`).trim()!=='t') {
 throw new Error('canonical_strict_null_failed');
}
let tooDeepJson='"leaf"';for(let depth=0;depth<9;depth++) tooDeepJson=`[${tooDeepJson}]`;
if(Buffer.byteLength(tooDeepJson)>=4096||
 psql(`select operations_step8_service_private.json_depth_within_v1($depth$${tooDeepJson}$depth$::jsonb,1,8);`).trim()!=='f') {
 throw new Error('canonical_depth_guard_failed');
}
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
 if(canonical(JSON.parse(envelope.rawBody))!==envelope.rawBody) throw new Error('response_not_shared_canonical_json');
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
const v2InvoiceSourceOrg='60000000-0000-4000-8000-000000000001';
const v2InvoiceId='70000000-0000-4000-8000-000000000005';
const v2AllocationId='72000000-0000-4000-8000-000000000005';
const v2DocumentFingerprint='a'.repeat(64);
const v2SourceAnchor=sha(['finance-invoice-allocation-source-anchor-v1',v2InvoiceSourceOrg,v2InvoiceId,
 v2AllocationId,v2DocumentFingerprint,'SEK'].join('\n'));
if(v2SourceAnchor!=='ae6b60da02670b104c02b746e8fa3400b5b81fd69ef54c1e3651930dca835b95') {
 throw new Error('v2_fixture_anchor_formula_changed');
}
psql(`do $fixture$declare v_rows integer;begin
 delete from public.operations_finance_invoice_snapshots
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and source_revision=1;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'v1_invoice_snapshot_fixture_cleanup_count:%',v_rows;end if;
 delete from public.operations_finance_invoice_streams
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and current_revision=1;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'v1_invoice_stream_fixture_cleanup_count:%',v_rows;end if;
 update public.operations_finance_credit_v2_snapshots
 set envelope=jsonb_set(envelope,'{allocations,0,source_anchor}',to_jsonb('${v2SourceAnchor}'::text))
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and source_revision=2;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'v2_invoice_snapshot_fixture_repair_count:%',v_rows;end if;
 select count(*) into v_rows from public.operations_finance_credit_v2_streams
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and current_revision=2;
 if v_rows<>1 then raise exception 'v2_invoice_stream_fixture_retained_count:%',v_rows;end if;
 select count(*) into v_rows from public.operations_finance_credit_v2_snapshots
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and source_revision=2;
 if v_rows<>1 then raise exception 'v2_invoice_snapshot_fixture_retained_count:%',v_rows;end if;
 select count(*) into v_rows from public.operations_finance_invoice_economic_current_v2
 where organization_id='${sourceOrg}' and source_organization_id='${v2InvoiceSourceOrg}'
  and invoice_id='${v2InvoiceId}' and source_protocol='v2';
 if v_rows<>1 then raise exception 'v2_invoice_current_fixture_retained_count:%',v_rows;end if;
end$fixture$;`);
domainBefore=domainFingerprint();receiptsBefore=receiptCount();
const availableReq=request();const available=call(availableReq);verifyEnvelope(available,availableReq);const availableBody=JSON.parse(available.rawBody);
const payloadKeys=['authoritativeTotals','authority','coverage','exceptions','financeRecalculated','generatedAt','invoices',
 'organizationId','personnel','projectId','replacesLegacyTotals','schema','shadowOnly'];
if(JSON.stringify(payloadKeys)!==JSON.stringify([...payloadKeys].sort())) throw new Error('expected_payload_keys_not_js_sorted');
const previousIncorrectPayloadKeys=['authority','authoritativeTotals',...payloadKeys.slice(2)];
if(JSON.stringify(previousIncorrectPayloadKeys)===JSON.stringify([...previousIncorrectPayloadKeys].sort())||
 JSON.stringify([...previousIncorrectPayloadKeys].sort())!==JSON.stringify(payloadKeys)) {
  throw new Error('payload_key_order_regression_vector_invalid');
}
const actualPayloadKeys=Object.keys(availableBody.payload??{}).sort();
if(available.status!==200||availableBody.outcome!=='available'||availableBody.payload?.schema!=='operations-project-economy-step8-shadow.v1'||
 JSON.stringify(actualPayloadKeys)!==JSON.stringify(payloadKeys)||
 availableBody.payload?.financeRecalculated!==false||availableBody.payload?.authoritativeTotals!==false||
 availableBody.payload?.replacesLegacyTotals!==false||availableBody.payload?.shadowOnly!==true) throw new Error('available_shadow_payload_failed');
if(!availableBody.payload.personnel.some(row=>row.amountMinor===null)) throw new Error('missing_rate_null_lost');
if(!availableBody.payload.invoices.some(row=>row.creditRelationCoverage==='linked'&&typeof row.creditRelationshipFingerprint==='string')) throw new Error('linked_credit_lost');
const projectedV2Invoices=availableBody.payload.invoices.filter(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId);
const projectedV2Invoice=projectedV2Invoices[0];
if(projectedV2Invoices.length!==1||projectedV2Invoice.sourceProtocol!=='v2'||projectedV2Invoice.kind!=='invoice'||
 projectedV2Invoice.sourceOrganizationId!==v2InvoiceSourceOrg||projectedV2Invoice.sourceAnchor!==v2SourceAnchor||
 projectedV2Invoice.sourceObservationId!=='71000000-0000-4000-8000-000000000005'||
 projectedV2Invoice.revision!==2||projectedV2Invoice.sourceEconomicRevision!==1||
 projectedV2Invoice.sourceEconomicFingerprint!=='b'.repeat(64)||projectedV2Invoice.publicationFingerprint!=='d'.repeat(64)||
 projectedV2Invoice.documentFingerprint!=='a'.repeat(64)||projectedV2Invoice.status!=='preliminary'||
 projectedV2Invoice.approvalState!=='pending'||projectedV2Invoice.accountingState!=='draft'||
 projectedV2Invoice.settlementState!=='unpaid'||projectedV2Invoice.sourceChanged!==false||
 projectedV2Invoice.amountMinor!==1000||projectedV2Invoice.creditedSourceAnchor!==null) {
 throw new Error('synthetic_v2_invoice_fixture_not_projected_exactly');
}
const v2CreditInvoiceId='70000000-0000-4000-8000-000000000002';
const v2CreditAllocationId='72000000-0000-4000-8000-000000000002';
const projectedV2Credits=availableBody.payload.invoices.filter(row=>row.invoiceId===v2CreditInvoiceId&&
 row.allocationId===v2CreditAllocationId);
const projectedV2Credit=projectedV2Credits[0];
if(projectedV2Credits.length!==1||projectedV2Credit.sourceProtocol!=='v2'||projectedV2Credit.kind!=='credit'||
 projectedV2Credit.sourceOrganizationId!=='60000000-0000-4000-8000-000000000001'||
 projectedV2Credit.sourceObservationId!=='71000000-0000-4000-8000-000000000002'||
 projectedV2Credit.sourceAnchor!=='dd9f60cc79dc20168211d32b99177ea652a792ed424d2176e3e353348c02f695'||
 projectedV2Credit.creditedSourceAnchor!=='8650074bd66bdab99b5ae461ed3394c8a1a23f45d33ee369faab5e2680b49f3e'||
 projectedV2Credit.sourceEconomicFingerprint!=='c'.repeat(64)||projectedV2Credit.publicationFingerprint!=='8'.repeat(64)||
 projectedV2Credit.documentFingerprint!=='d'.repeat(64)||projectedV2Credit.status!=='preliminary'||
 projectedV2Credit.approvalState!=='pending'||projectedV2Credit.accountingState!=='draft'||
 projectedV2Credit.settlementState!=='unpaid'||projectedV2Credit.sourceChanged!==true||
 projectedV2Credit.amountMinor!==-10000||projectedV2Credit.creditRelationCoverage!=='linked'||
 projectedV2Credit.sourceAnchor===projectedV2Credit.creditedSourceAnchor) {
 throw new Error('synthetic_v2_credit_fixture_not_projected_exactly');
}
if(availableBody.payload.personnel.length>500||availableBody.payload.invoices.length>500||
 availableBody.payload.exceptions.length>2500||Buffer.byteLength(canonical(availableBody.payload))>262144) {
 throw new Error('projector_payload_bounds_failed');
}
if(sha(canonical(availableBody.payload))!==availableBody.payloadSha256) throw new Error('payload_fingerprint_failed');
if(domainFingerprint()!==domainBefore||receiptCount()!==receiptsBefore+1) throw new Error('available_domain_writes_or_receipt_count_failed');
domainBefore=domainFingerprint();receiptsBefore=receiptCount();
const uuidV7Req=request({body:{requestId:'90000000-0000-7000-8000-000000000001'}});
expectState(uuidV7Req,'22023');
if(receiptCount()!==receiptsBefore||domainFingerprint()!==domainBefore) throw new Error('request_uuid_v7_wrote');

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

const beforeInvalid=receiptCount(),beforeInvalidDomain=domainFingerprint();
expectState(request({signature:'hmac-sha256='+'0'.repeat(64)}),'28000');
const headerProbe=request();
for(const key of Object.keys(headerProbe.headers)){
 for(const variant of ['null','wrong-type']){
  const malformed=request();
  malformed.headers[key]=variant==='null'?null:
   (typeof headerProbe.headers[key]==='number'?String(headerProbe.headers[key]):7);
  expectState(malformed,key==='signature'?'28000':'22023');
 }
}
expectState(request({headers:{issuedAt:9007199254740992}}),'22023');
const actorSwap=request();actorSwap.headers.actorSubjectHash='c'.repeat(64);expectState(actorSwap,'28000');
const idSwap=request();idSwap.headers.requestId='90000000-0000-4000-8000-999999999999';expectState(idSwap,'28000');
expectState(request({body:{sourceProjectId:'20000000-0000-4000-8000-000000000003'}}),'42501');
const tooLong=request({body:{expiresAt:Math.floor(Date.now()/1000)+61}});expectState(tooLong,'22023');
const future=request({body:{issuedAt:Math.floor(Date.now()/1000)+6,authCheckedAt:Math.floor(Date.now()/1000)+5,expiresAt:Math.floor(Date.now()/1000)+50}});expectState(future,'28000');
const duplicate=request();duplicate.raw=duplicate.raw.replace('{','{"actorSubjectHash":"'+actorHash+'",');duplicate.headers.bodySha256=sha(duplicate.raw);expectState(duplicate,'22023');
const floatBase=request();
expectState(request({body:floatBase.body,raw:floatBase.raw.replace('"sourceCount":3,','"sourceCount":3.0,')}),'22023');
const exponentBase=request();
expectState(request({body:exponentBase.body,raw:exponentBase.raw.replace('"sourceCount":3,','"sourceCount":3e0,')}),'22023');
let deepActor=actorHash;for(let depth=0;depth<12;depth++) deepActor=[deepActor];
const deepRequest=request({body:{actorSubjectHash:deepActor}});
if(Buffer.byteLength(deepRequest.raw)>=4096) throw new Error('deep_request_fixture_not_bounded');
expectState(deepRequest,'22023');
if(receiptCount()!==beforeInvalid||domainFingerprint()!==beforeInvalidDomain) throw new Error('invalid_requests_wrote_state');

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

// A compromised or later-regressed projector must be converted to the same
// authenticated, receipted unavailable outcome before any invalid payload is
// canonicalized or signed as available.
const installHostileProjector=(payload,preserveGeneratedAt=false,transform=expression=>expression)=>{
 const payloadBase64=b64(JSON.stringify(payload));
 const baseExpression=preserveGeneratedAt
  ?`convert_from(decode('${payloadBase64}','base64'),'UTF8')::jsonb`
  :`jsonb_set(convert_from(decode('${payloadBase64}','base64'),'UTF8')::jsonb,'{generatedAt}',to_jsonb(now()))`;
 const payloadExpression=transform(baseExpression);
 psql(`create or replace function operations_economy_private.project_economy_step8_shadow_payload_v1(
  p_organization_id uuid,p_project_id uuid)
 returns jsonb language sql stable security invoker set search_path='' as $hostile$
  select ${payloadExpression}
 $hostile$;`);
};
const assertHostileProjectorUnavailable=(payload,label,preserveGeneratedAt=false)=>{
 installHostileProjector(payload,preserveGeneratedAt);domainBefore=domainFingerprint();receiptsBefore=receiptCount();
 const hostileReq=request();const hostile=call(hostileReq);verifyEnvelope(hostile,hostileReq);
 const hostileBody=JSON.parse(hostile.rawBody);
 if(hostile.status!==409||hostileBody.outcome!=='unavailable'||hostileBody.payload!==null||
  receiptCount()!==receiptsBefore+1||domainFingerprint()!==domainBefore) {
  throw new Error(`hostile_projector_shape_not_fail_closed:${label}`);
 }
};
const assertHostileProjectorAvailable=(payload,label,transform)=>{
 installHostileProjector(payload,false,transform);domainBefore=domainFingerprint();receiptsBefore=receiptCount();
 const hostileReq=request();const hostile=call(hostileReq);verifyEnvelope(hostile,hostileReq);
 const hostileBody=JSON.parse(hostile.rawBody);
 if(hostile.status!==200||hostileBody.outcome!=='available'||hostileBody.payload===null||
  receiptCount()!==receiptsBefore+1||domainFingerprint()!==domainBefore) {
  throw new Error(`hostile_projector_valid_control_failed:${label}`);
 }
};
assertHostileProjectorAvailable(structuredClone(availableBody.payload),'fresh-unmodified-control');
const scaledAmountPayload=structuredClone(availableBody.payload);
const scaledPersonnelIndex=scaledAmountPayload.personnel.findIndex(row=>row.coverage==='complete');
const scaledInvoiceIndex=scaledAmountPayload.invoices.findIndex(row=>row.kind==='invoice');
if(scaledPersonnelIndex<0||scaledInvoiceIndex<0) throw new Error('scaled_amount_fixture_missing');
assertHostileProjectorAvailable(scaledAmountPayload,'integral-scaled-jsonb-amounts',expression=>
 `jsonb_set(jsonb_set(${expression},'{personnel,${scaledPersonnelIndex},amountMinor}','0.00'::jsonb),`+
 `'{invoices,${scaledInvoiceIndex},amountMinor}','1.0'::jsonb)`);
const hostileRootPayload=structuredClone(availableBody.payload);hostileRootPayload.schema=null;
assertHostileProjectorUnavailable(hostileRootPayload,'root-null');
const missingRootKeyPayload=structuredClone(availableBody.payload);
const missingRootKeyCount=Object.keys(missingRootKeyPayload).length;
delete missingRootKeyPayload.authority;
if('authority' in missingRootKeyPayload||Object.keys(missingRootKeyPayload).length!==missingRootKeyCount-1) {
 throw new Error('missing_root_key_probe_is_vacuous');
}
assertHostileProjectorUnavailable(missingRootKeyPayload,'root-key-missing');
const extraRootKeyPayload=structuredClone(availableBody.payload);
const extraRootKeyCount=Object.keys(extraRootKeyPayload).length;
extraRootKeyPayload.unexpectedRootKey=true;
if(!('unexpectedRootKey' in extraRootKeyPayload)||Object.keys(extraRootKeyPayload).length!==extraRootKeyCount+1) {
 throw new Error('extra_root_key_probe_is_vacuous');
}
assertHostileProjectorUnavailable(extraRootKeyPayload,'root-key-extra');
const hostileMinutesPayload=structuredClone(availableBody.payload);
hostileMinutesPayload.personnel[0].minutes='not-an-integer';
assertHostileProjectorUnavailable(hostileMinutesPayload,'personnel-minutes-wrong-type');
const hostileFractionalAmountPayload=structuredClone(availableBody.payload);
hostileFractionalAmountPayload.personnel.find(row=>row.coverage==='complete').amountMinor=1.5;
assertHostileProjectorUnavailable(hostileFractionalAmountPayload,'personnel-amount-fractional');
const hostileUnsafeRevisionPayload=structuredClone(availableBody.payload);
hostileUnsafeRevisionPayload.invoices[0].revision=9007199254740992;
assertHostileProjectorUnavailable(hostileUnsafeRevisionPayload,'invoice-revision-unsafe');
const hostileUppercaseReportPayload=structuredClone(availableBody.payload);
hostileUppercaseReportPayload.personnel[0].reportId='4abcdef0-0000-4000-8000-000000000001'.toUpperCase();
if(hostileUppercaseReportPayload.personnel[0].reportId===hostileUppercaseReportPayload.personnel[0].reportId.toLowerCase()) {
 throw new Error('uppercase_report_id_probe_is_vacuous');
}
assertHostileProjectorUnavailable(hostileUppercaseReportPayload,'personnel-report-id-not-canonical');
const v2AnchorPayload=structuredClone(availableBody.payload);
const hostileV2Invoice=v2AnchorPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId);
if(!hostileV2Invoice) throw new Error('hostile_v2_invoice_fixture_missing');
hostileV2Invoice.sourceAnchor=null;
assertHostileProjectorUnavailable(v2AnchorPayload,'v2-null-source-anchor');

const rebuildTopExceptions=(payload)=>{
 const projected=[];
 for(const row of payload.personnel){
  if(row.coverage==='missing_rate'&&row.status!=='rejected') projected.push({category:'personnel',
   identity:`${row.sourceTimeStreamKey}:${row.lineId}`,code:'missing_rate',amountMinor:null});
 }
 for(const row of payload.invoices) for(const code of row.exceptions) projected.push({category:'invoice',
  identity:`${row.invoiceId}:${row.allocationId}`,code,amountMinor:code==='unallocated_amount'?row.unallocatedMinor:null});
 payload.exceptions=projected.sort((left,right)=>compareText(left.category,right.category)||compareText(left.identity,right.identity));
};
const compareText=(left,right)=>left<right?-1:left>right?1:0;
const sortProjectorRows=(payload)=>{
 payload.personnel.sort((left,right)=>compareText(left.workDate,right.workDate)||
  compareText(left.sourceTimeStreamKey,right.sourceTimeStreamKey)||compareText(left.lineId,right.lineId));
 payload.invoices.sort((left,right)=>compareText(left.invoiceId,right.invoiceId)||compareText(left.allocationId,right.allocationId));
 payload.exceptions.sort((left,right)=>compareText(left.category,right.category)||compareText(left.identity,right.identity));
};
const sourceAnchorFor=row=>sha(['finance-invoice-allocation-source-anchor-v1',row.sourceOrganizationId.toLowerCase(),
 row.invoiceId.toLowerCase(),row.allocationId.toLowerCase(),row.documentFingerprint.toLowerCase(),row.currency.toUpperCase()].join('\n'));
const toggleInvoiceException=(payload,predicate,code,label)=>{
 const invoice=payload.invoices.find(predicate);if(!invoice) throw new Error(`hostile_invoice_fixture_missing:${label}`);
 invoice.exceptions=invoice.exceptions.includes(code)?invoice.exceptions.filter(value=>value!==code):[...invoice.exceptions,code];
 rebuildTopExceptions(payload);
 assertHostileProjectorUnavailable(payload,label);
};
toggleInvoiceException(structuredClone(availableBody.payload),()=>true,'source_changed_after_import','source-changed-flag');
toggleInvoiceException(structuredClone(availableBody.payload),row=>row.kind==='credit','credit_relation_unresolved','credit-coverage-flag');
toggleInvoiceException(structuredClone(availableBody.payload),()=>true,'unallocated_amount','unallocated-flag');
toggleInvoiceException(structuredClone(availableBody.payload),()=>true,'rejected_document','rejected-flag');

const duplicateExceptionPayload=structuredClone(availableBody.payload);
const duplicateExceptionInvoice=duplicateExceptionPayload.invoices.find(row=>row.exceptions.length>0);
if(!duplicateExceptionInvoice) throw new Error('hostile_exception_dedup_fixture_missing');
const duplicatedExceptionCode=duplicateExceptionInvoice.exceptions[0];
const duplicateTopIdentity=`${duplicateExceptionInvoice.invoiceId}:${duplicateExceptionInvoice.allocationId}`;
const nestedExceptionCountBefore=duplicateExceptionInvoice.exceptions.length;
const topDuplicateCountBefore=duplicateExceptionPayload.exceptions.filter(row=>row.category==='invoice'&&
 row.identity===duplicateTopIdentity&&row.code===duplicatedExceptionCode).length;
duplicateExceptionInvoice.exceptions.push(duplicatedExceptionCode);
rebuildTopExceptions(duplicateExceptionPayload);
const topDuplicateCountAfter=duplicateExceptionPayload.exceptions.filter(row=>row.category==='invoice'&&
 row.identity===duplicateTopIdentity&&row.code===duplicatedExceptionCode).length;
if(duplicateExceptionInvoice.exceptions.length!==nestedExceptionCountBefore+1||
 topDuplicateCountAfter!==topDuplicateCountBefore+1) throw new Error('invoice_exception_dedup_probe_is_vacuous');
assertHostileProjectorUnavailable(duplicateExceptionPayload,'invoice-exception-dedup');
const exceptionSetPayload=structuredClone(availableBody.payload);
exceptionSetPayload.invoices[0].exceptions.push('not_an_allowed_exception');
assertHostileProjectorUnavailable(exceptionSetPayload,'invoice-exception-set');

const topCategoryPayload=structuredClone(availableBody.payload);
const topCategoryException=topCategoryPayload.exceptions.find(row=>row.category==='personnel'&&row.code==='missing_rate');
if(!topCategoryException) throw new Error('hostile_top_exception_fixture_missing');
topCategoryException.category='invoice';
assertHostileProjectorUnavailable(topCategoryPayload,'top-exception-category');
const topCodePayload=structuredClone(availableBody.payload);
const topCodeException=topCodePayload.exceptions.find(row=>row.category==='personnel'&&row.code==='missing_rate');
if(!topCodeException) throw new Error('hostile_top_code_fixture_missing');
topCodeException.code='source_changed_after_import';
assertHostileProjectorUnavailable(topCodePayload,'top-exception-code');
const topAmountPayload=structuredClone(availableBody.payload);
const missingRateException=topAmountPayload.exceptions.find(row=>row.category==='personnel'&&row.code==='missing_rate');
if(!missingRateException) throw new Error('hostile_missing_rate_exception_fixture_missing');
missingRateException.amountMinor=1;
assertHostileProjectorUnavailable(topAmountPayload,'top-exception-amount');

const topDuplicatePayload=structuredClone(availableBody.payload);
topDuplicatePayload.exceptions.push(structuredClone(topDuplicatePayload.exceptions[0]));
assertHostileProjectorUnavailable(topDuplicatePayload,'top-exception-duplicate');
const topOmittedPayload=structuredClone(availableBody.payload);topOmittedPayload.exceptions.shift();
assertHostileProjectorUnavailable(topOmittedPayload,'top-exception-omitted');
const topSpuriousPayload=structuredClone(availableBody.payload);
topSpuriousPayload.exceptions.push({category:'invoice',identity:'00000000-0000-0000-0000-000000000000:00000000-0000-0000-0000-000000000000',
 code:'source_changed_after_import',amountMinor:null});
assertHostileProjectorUnavailable(topSpuriousPayload,'top-exception-spurious');
const topIdentityPayload=structuredClone(availableBody.payload);
topIdentityPayload.exceptions[0].identity='wrong:identity';
assertHostileProjectorUnavailable(topIdentityPayload,'top-exception-identity');
const topUnallocatedAmountPayload=structuredClone(availableBody.payload);
const unallocatedException=topUnallocatedAmountPayload.exceptions.find(row=>row.code==='unallocated_amount');
if(!unallocatedException) throw new Error('hostile_unallocated_exception_fixture_missing');
unallocatedException.amountMinor+=1;
assertHostileProjectorUnavailable(topUnallocatedAmountPayload,'top-unallocated-amount');

for(const [axis,nextValue] of [['personnel','complete'],['invoices','complete']]){
 const coveragePayload=structuredClone(availableBody.payload);
 coveragePayload.coverage[axis]=coveragePayload.coverage[axis]===nextValue?'incomplete':nextValue;
 assertHostileProjectorUnavailable(coveragePayload,`derived-${axis}-coverage`);
}
const v1ProvenancePayload=structuredClone(availableBody.payload);
const v1ProvenanceInvoice=v1ProvenancePayload.invoices.find(row=>row.sourceProtocol==='v1');
if(!v1ProvenanceInvoice) throw new Error('hostile_v1_fixture_missing');
v1ProvenanceInvoice.sourceEconomicRevision+=1;
assertHostileProjectorUnavailable(v1ProvenancePayload,'v1-economic-revision');
const v1FingerprintPayload=structuredClone(availableBody.payload);
v1FingerprintPayload.invoices.find(row=>row.sourceProtocol==='v1').sourceEconomicFingerprint='0'.repeat(64);
assertHostileProjectorUnavailable(v1FingerprintPayload,'v1-economic-fingerprint');
const v1SourceAnchorPayload=structuredClone(availableBody.payload);
v1SourceAnchorPayload.invoices.find(row=>row.sourceProtocol==='v1').sourceAnchor='2'.repeat(64);
assertHostileProjectorUnavailable(v1SourceAnchorPayload,'v1-source-anchor');
const v1CreditedAnchorPayload=structuredClone(availableBody.payload);
const v1CreditedAnchorCredit=v1CreditedAnchorPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='credit');
if(!v1CreditedAnchorCredit) throw new Error('hostile_v1_credit_fixture_missing');
v1CreditedAnchorCredit.creditedSourceAnchor='3'.repeat(64);
assertHostileProjectorUnavailable(v1CreditedAnchorPayload,'v1-credited-source-anchor');
const v1RelationshipPayload=structuredClone(availableBody.payload);
v1RelationshipPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='credit').creditRelationshipFingerprint='1'.repeat(64);
assertHostileProjectorUnavailable(v1RelationshipPayload,'v1-credit-relationship-fingerprint');
const v1LinkedPayload=structuredClone(availableBody.payload);
const v1Credit=v1LinkedPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='credit');
if(!v1Credit) throw new Error('hostile_v1_credit_fixture_missing');
v1Credit.creditRelationCoverage='linked';v1Credit.creditRelationshipFingerprint='1'.repeat(64);
v1Credit.sourceAnchor='2'.repeat(64);v1Credit.creditedSourceAnchor='3'.repeat(64);
v1Credit.exceptions=v1Credit.exceptions.filter(code=>code!=='credit_relation_unresolved');rebuildTopExceptions(v1LinkedPayload);
assertHostileProjectorUnavailable(v1LinkedPayload,'v1-linked-credit');
const v2EqualAnchorPayload=structuredClone(availableBody.payload);
const v2EqualAnchorCredit=v2EqualAnchorPayload.invoices.find(row=>row.invoiceId===v2CreditInvoiceId&&
 row.allocationId===v2CreditAllocationId);
if(!v2EqualAnchorCredit) throw new Error('hostile_v2_credit_fixture_missing');
v2EqualAnchorCredit.creditedSourceAnchor=v2EqualAnchorCredit.sourceAnchor;
assertHostileProjectorUnavailable(v2EqualAnchorPayload,'v2-equal-source-anchors');
const v2HashPayload=structuredClone(availableBody.payload);
v2HashPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId).sourceAnchor='0'.repeat(64);
assertHostileProjectorUnavailable(v2HashPayload,'v2-source-anchor-hash');
const v2NilUuidPayload=structuredClone(availableBody.payload);
v2NilUuidPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId)
 .sourceObservationId='00000000-0000-0000-0000-000000000000';
assertHostileProjectorUnavailable(v2NilUuidPayload,'v2-nil-source-observation-uuid');
const v2VersionSevenPayload=structuredClone(availableBody.payload);
const v2VersionSevenInvoice=v2VersionSevenPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId);
v2VersionSevenInvoice.invoiceId='70000000-0000-7000-8000-000000000001';
v2VersionSevenInvoice.sourceAnchor=sourceAnchorFor(v2VersionSevenInvoice);rebuildTopExceptions(v2VersionSevenPayload);sortProjectorRows(v2VersionSevenPayload);
assertHostileProjectorUnavailable(v2VersionSevenPayload,'v2-version-seven-invoice-uuid');
const v2BadVariantPayload=structuredClone(availableBody.payload);
const v2BadVariantInvoice=v2BadVariantPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId);
v2BadVariantInvoice.allocationId='72000000-0000-4000-7000-000000000001';
v2BadVariantInvoice.sourceAnchor=sourceAnchorFor(v2BadVariantInvoice);rebuildTopExceptions(v2BadVariantPayload);sortProjectorRows(v2BadVariantPayload);
assertHostileProjectorUnavailable(v2BadVariantPayload,'v2-bad-variant-allocation-uuid');
const personnelAmountPayload=structuredClone(availableBody.payload);
const completePersonnel=personnelAmountPayload.personnel.find(row=>row.coverage==='complete');
if(!completePersonnel) throw new Error('hostile_complete_personnel_fixture_missing');
completePersonnel.amountMinor=-1;
assertHostileProjectorUnavailable(personnelAmountPayload,'personnel-negative-complete-amount');
const zeroMinutesPayload=structuredClone(availableBody.payload);
zeroMinutesPayload.personnel.find(row=>row.coverage==='complete').minutes=0;
assertHostileProjectorAvailable(zeroMinutesPayload,'legacy-zero-minutes-preserved');
const invoiceSignPayload=structuredClone(availableBody.payload);
const positiveInvoice=invoiceSignPayload.invoices.find(row=>row.kind==='invoice');
if(!positiveInvoice) throw new Error('hostile_positive_invoice_fixture_missing');positiveInvoice.amountMinor=-1;
assertHostileProjectorUnavailable(invoiceSignPayload,'invoice-amount-sign');
const invoiceZeroPayload=structuredClone(availableBody.payload);
invoiceZeroPayload.invoices.find(row=>row.kind==='invoice').amountMinor=0;
assertHostileProjectorUnavailable(invoiceZeroPayload,'invoice-zero-amount');
const v2InvoiceSignPayload=structuredClone(availableBody.payload);
const wrongSignV2Invoice=v2InvoiceSignPayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&row.allocationId===v2AllocationId);
if(!wrongSignV2Invoice||!(wrongSignV2Invoice.amountMinor>0)) throw new Error('v2_invoice_sign_probe_fixture_invalid');
wrongSignV2Invoice.amountMinor=-wrongSignV2Invoice.amountMinor;
if(!(wrongSignV2Invoice.amountMinor<0)) throw new Error('v2_invoice_sign_probe_is_vacuous');
assertHostileProjectorUnavailable(v2InvoiceSignPayload,'v2-invoice-wrong-sign');
const v2CreditSignPayload=structuredClone(availableBody.payload);
const wrongSignV2Credit=v2CreditSignPayload.invoices.find(row=>row.invoiceId===v2CreditInvoiceId&&
 row.allocationId===v2CreditAllocationId);
if(!wrongSignV2Credit||!(wrongSignV2Credit.amountMinor<0)) throw new Error('v2_credit_sign_probe_fixture_invalid');
wrongSignV2Credit.amountMinor=-wrongSignV2Credit.amountMinor;
if(!(wrongSignV2Credit.amountMinor>0)) throw new Error('v2_credit_sign_probe_is_vacuous');
assertHostileProjectorUnavailable(v2CreditSignPayload,'v2-credit-wrong-sign');
const confirmedChangedPayload=structuredClone(availableBody.payload);
const confirmedChangedInvoice=confirmedChangedPayload.invoices.find(row=>row.kind==='invoice');
confirmedChangedInvoice.status='confirmed';confirmedChangedInvoice.sourceChanged=true;
if(!confirmedChangedInvoice.exceptions.includes('source_changed_after_import')) confirmedChangedInvoice.exceptions.push('source_changed_after_import');
confirmedChangedInvoice.exceptions=confirmedChangedInvoice.exceptions.filter(code=>code!=='rejected_document');rebuildTopExceptions(confirmedChangedPayload);
assertHostileProjectorUnavailable(confirmedChangedPayload,'confirmed-source-changed');

const duplicatePersonnelPayload=structuredClone(availableBody.payload);
duplicatePersonnelPayload.personnel.push(structuredClone(duplicatePersonnelPayload.personnel.find(row=>row.coverage==='complete')));
assertHostileProjectorUnavailable(duplicatePersonnelPayload,'duplicate-personnel-identity');
const duplicateInvoicePayload=structuredClone(availableBody.payload);
const duplicateInvoiceSource=duplicateInvoicePayload.invoices.find(row=>row.sourceProtocol==='v1');
if(!duplicateInvoiceSource) throw new Error('hostile_v1_duplicate_invoice_fixture_missing');
duplicateInvoiceSource.sourceOrganizationId='a0000000-0000-4000-8000-000000000001';
duplicateInvoiceSource.invoiceId='b0000000-0000-4000-8000-000000000001';
duplicateInvoiceSource.allocationId='c0000000-0000-4000-8000-000000000001';
const caseOnlyDuplicateInvoice=structuredClone(duplicateInvoiceSource);
caseOnlyDuplicateInvoice.allocationId=caseOnlyDuplicateInvoice.allocationId.toUpperCase();
if(caseOnlyDuplicateInvoice.allocationId===duplicateInvoiceSource.allocationId||
 caseOnlyDuplicateInvoice.allocationId.toLowerCase()!==duplicateInvoiceSource.allocationId.toLowerCase()) {
 throw new Error('case_insensitive_duplicate_invoice_probe_is_vacuous');
}
duplicateInvoicePayload.invoices.push(caseOnlyDuplicateInvoice);
rebuildTopExceptions(duplicateInvoicePayload);sortProjectorRows(duplicateInvoicePayload);
assertHostileProjectorUnavailable(duplicateInvoicePayload,'case-insensitive-duplicate-invoice-identity');
const invoiceSiblingPayload=structuredClone(availableBody.payload);
const invoiceSiblingSource=invoiceSiblingPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='invoice');
if(!invoiceSiblingSource) throw new Error('invoice_sibling_fixture_missing');
invoiceSiblingSource.unallocatedMinor=0;
invoiceSiblingSource.exceptions=invoiceSiblingSource.exceptions.filter(code=>code!=='unallocated_amount');
const incoherentInvoiceSibling=structuredClone(invoiceSiblingSource);
incoherentInvoiceSibling.allocationId='72000000-0000-4000-8000-000000000099';
incoherentInvoiceSibling.amountMinor=5000;
incoherentInvoiceSibling.currency='EUR';
invoiceSiblingPayload.invoices.push(incoherentInvoiceSibling);rebuildTopExceptions(invoiceSiblingPayload);sortProjectorRows(invoiceSiblingPayload);
assertHostileProjectorUnavailable(invoiceSiblingPayload,'invoice-document-sibling-coherence');
const invoiceStatusSiblingPayload=structuredClone(availableBody.payload);
const invoiceStatusSiblingSource=invoiceStatusSiblingPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='invoice');
invoiceStatusSiblingSource.unallocatedMinor=0;
invoiceStatusSiblingSource.exceptions=invoiceStatusSiblingSource.exceptions.filter(code=>code!=='unallocated_amount');
const incoherentInvoiceStatusSibling=structuredClone(invoiceStatusSiblingSource);
incoherentInvoiceStatusSibling.allocationId='72000000-0000-4000-8000-000000000097';
incoherentInvoiceStatusSibling.amountMinor=5000;
incoherentInvoiceStatusSibling.status='rejected';
incoherentInvoiceStatusSibling.exceptions.push('rejected_document');
invoiceStatusSiblingPayload.invoices.push(incoherentInvoiceStatusSibling);
rebuildTopExceptions(invoiceStatusSiblingPayload);sortProjectorRows(invoiceStatusSiblingPayload);
assertHostileProjectorUnavailable(invoiceStatusSiblingPayload,'invoice-status-sibling-coherence');
const invoiceCaseSiblingPayload=structuredClone(availableBody.payload);
const invoiceCaseSiblingSource=invoiceCaseSiblingPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='invoice');
invoiceCaseSiblingSource.unallocatedMinor=0;
invoiceCaseSiblingSource.exceptions=invoiceCaseSiblingSource.exceptions.filter(code=>code!=='unallocated_amount');
invoiceCaseSiblingSource.sourceOrganizationId='a0000000-0000-4000-8000-000000000001';
invoiceCaseSiblingSource.invoiceId='b0000000-0000-4000-8000-000000000001';
const incoherentInvoiceCaseSibling=structuredClone(invoiceCaseSiblingSource);
incoherentInvoiceCaseSibling.allocationId='72000000-0000-4000-8000-000000000096';
incoherentInvoiceCaseSibling.amountMinor=5000;
incoherentInvoiceCaseSibling.sourceOrganizationId=incoherentInvoiceCaseSibling.sourceOrganizationId.toUpperCase();
incoherentInvoiceCaseSibling.invoiceId=incoherentInvoiceCaseSibling.invoiceId.toUpperCase();
if(incoherentInvoiceCaseSibling.sourceOrganizationId===invoiceCaseSiblingSource.sourceOrganizationId||
 incoherentInvoiceCaseSibling.invoiceId===invoiceCaseSiblingSource.invoiceId) throw new Error('invoice_case_probe_is_vacuous');
invoiceCaseSiblingPayload.invoices.push(incoherentInvoiceCaseSibling);
rebuildTopExceptions(invoiceCaseSiblingPayload);sortProjectorRows(invoiceCaseSiblingPayload);
assertHostileProjectorUnavailable(invoiceCaseSiblingPayload,'invoice-raw-identity-sibling-coherence');
const personnelSiblingPayload=structuredClone(availableBody.payload);
const personnelSiblingSource=personnelSiblingPayload.personnel.find(row=>row.coverage==='complete');
const incoherentPersonnelSibling=structuredClone(personnelSiblingSource);
incoherentPersonnelSibling.lineId=`${incoherentPersonnelSibling.lineId}-sibling`;
incoherentPersonnelSibling.workDate='2026-10-04';
personnelSiblingPayload.personnel.push(incoherentPersonnelSibling);sortProjectorRows(personnelSiblingPayload);
assertHostileProjectorUnavailable(personnelSiblingPayload,'personnel-stream-sibling-coherence');
const personnelOrderPayload=structuredClone(availableBody.payload);personnelOrderPayload.personnel.reverse();
assertHostileProjectorUnavailable(personnelOrderPayload,'personnel-projector-order');
const invoiceOrderPayload=structuredClone(availableBody.payload);invoiceOrderPayload.invoices.reverse();
assertHostileProjectorUnavailable(invoiceOrderPayload,'invoice-projector-order');
const topOrderPayload=structuredClone(availableBody.payload);topOrderPayload.exceptions.reverse();
assertHostileProjectorUnavailable(topOrderPayload,'top-exception-projector-order');
const nestedOrderPayload=structuredClone(availableBody.payload);
const nestedOrderCredit=nestedOrderPayload.invoices.find(row=>row.invoiceId===v2CreditInvoiceId&&
 row.allocationId===v2CreditAllocationId);
nestedOrderCredit.creditRelationCoverage='unresolved';
if(!nestedOrderCredit.exceptions.includes('credit_relation_unresolved')) nestedOrderCredit.exceptions.push('credit_relation_unresolved');
rebuildTopExceptions(nestedOrderPayload);nestedOrderCredit.exceptions.reverse();
assertHostileProjectorUnavailable(nestedOrderPayload,'nested-invoice-exception-order');
const generatedAtPayload=structuredClone(availableBody.payload);generatedAtPayload.generatedAt='2026-01-01T00:00:00+00:00';
assertHostileProjectorUnavailable(generatedAtPayload,'generated-at-stale',true);
const workDatePayload=structuredClone(availableBody.payload);workDatePayload.personnel[0].workDate='2026-02-30';
assertHostileProjectorUnavailable(workDatePayload,'work-date-invalid');
const yearZeroWorkDatePayload=structuredClone(availableBody.payload);yearZeroWorkDatePayload.personnel[0].workDate='0000-02-29';
assertHostileProjectorUnavailable(yearZeroWorkDatePayload,'work-date-year-zero');
const leapWorkDatePayload=structuredClone(availableBody.payload);leapWorkDatePayload.personnel[0].workDate='2024-02-29';
assertHostileProjectorAvailable(leapWorkDatePayload,'work-date-valid-leap-day');

const unresolvedPartialPayload=structuredClone(availableBody.payload);
const unresolvedPartialCredit=unresolvedPartialPayload.invoices.find(row=>row.invoiceId===v2CreditInvoiceId&&
 row.allocationId===v2CreditAllocationId);
unresolvedPartialCredit.creditRelationCoverage='unresolved';
if(!unresolvedPartialCredit.exceptions.includes('credit_relation_unresolved')) unresolvedPartialCredit.exceptions.push('credit_relation_unresolved');
rebuildTopExceptions(unresolvedPartialPayload);
assertHostileProjectorAvailable(unresolvedPartialPayload,'v2-unresolved-partial-relation');
const strictV2UppercasePayload=structuredClone(availableBody.payload);
const strictV2UppercaseInvoice=strictV2UppercasePayload.invoices.find(row=>row.invoiceId===v2InvoiceId&&
 row.allocationId===v2AllocationId);
const strictV2LetteredIds={sourceOrganizationId:'a0000000-0000-4000-8000-000000000001',
 invoiceId:'b0000000-0000-4000-8000-000000000001',allocationId:'c0000000-0000-4000-8000-000000000001',
 sourceObservationId:'d0000000-0000-4000-8000-000000000001'};
for(const [key,value] of Object.entries(strictV2LetteredIds)) strictV2UppercaseInvoice[key]=value.toUpperCase();
if(!Object.keys(strictV2LetteredIds).every(key=>/[A-F]/.test(strictV2UppercaseInvoice[key]))) {
 throw new Error('v2_uppercase_uuid_probe_is_vacuous');
}
strictV2UppercaseInvoice.sourceAnchor=sourceAnchorFor(strictV2UppercaseInvoice);
rebuildTopExceptions(strictV2UppercasePayload);sortProjectorRows(strictV2UppercasePayload);
assertHostileProjectorAvailable(strictV2UppercasePayload,'v2-strict-uuid-case-insensitive');
const multiAllocationPayload=structuredClone(availableBody.payload);
const multiAllocationSource=multiAllocationPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='invoice');
multiAllocationSource.unallocatedMinor=0;
multiAllocationSource.exceptions=multiAllocationSource.exceptions.filter(code=>code!=='unallocated_amount');
const multiAllocationRow=structuredClone(multiAllocationSource);
multiAllocationRow.allocationId='72000000-0000-4000-8000-000000000098';
multiAllocationRow.amountMinor=5000;
multiAllocationPayload.invoices.push(multiAllocationRow);rebuildTopExceptions(multiAllocationPayload);sortProjectorRows(multiAllocationPayload);
for(const row of multiAllocationPayload.invoices.filter(row=>row.sourceOrganizationId.toLowerCase()===multiAllocationSource.sourceOrganizationId.toLowerCase()&&
 row.invoiceId.toLowerCase()===multiAllocationSource.invoiceId.toLowerCase())) {
 row.sourceOrganizationId='A0000000-0000-4000-8000-000000000001';
 row.invoiceId='B0000000-0000-4000-8000-000000000001';
}
rebuildTopExceptions(multiAllocationPayload);sortProjectorRows(multiAllocationPayload);
assertHostileProjectorAvailable(multiAllocationPayload,'genuine-uppercase-multi-allocation-invoice');
const multiLinePersonnelPayload=structuredClone(availableBody.payload);
const multiLinePersonnelSource=multiLinePersonnelPayload.personnel.find(row=>row.coverage==='complete');
const multiLinePersonnelRow=structuredClone(multiLinePersonnelSource);multiLinePersonnelRow.lineId=`${multiLinePersonnelRow.lineId}-second`;
multiLinePersonnelPayload.personnel.push(multiLinePersonnelRow);sortProjectorRows(multiLinePersonnelPayload);
assertHostileProjectorAvailable(multiLinePersonnelPayload,'genuine-multi-line-personnel-stream');
const rejectedMissingRatePayload=structuredClone(availableBody.payload);
const rejectedMissingRateRow=rejectedMissingRatePayload.personnel.find(row=>row.coverage==='missing_rate');
if(!rejectedMissingRateRow) throw new Error('hostile_missing_rate_personnel_fixture_missing');
rejectedMissingRateRow.status='rejected';
rebuildTopExceptions(rejectedMissingRatePayload);
assertHostileProjectorAvailable(rejectedMissingRatePayload,'rejected-missing-rate-top-suppression');
const collidingVisibleIdentityPayload=structuredClone(availableBody.payload);
const collidingVisibleInvoiceId='70000000-0000-4000-8000-000000000004';
const collidingVisibleAllocationId='72000000-0000-4000-8000-000000000004';
const collidingVisibleIdentitySource=collidingVisibleIdentityPayload.invoices.find(row=>row.sourceProtocol==='v1'&&row.kind==='credit'&&
 row.sourceOrganizationId==='60000000-0000-4000-8000-000000000001'&&row.invoiceId===collidingVisibleInvoiceId&&
 row.allocationId===collidingVisibleAllocationId);
if(!collidingVisibleIdentitySource) throw new Error('same_visible_exception_identity_source_missing');
const collidingVisibleIdentityRow=structuredClone(collidingVisibleIdentitySource);
collidingVisibleIdentityRow.sourceOrganizationId='60000000-0000-4000-8000-000000000099';
if(collidingVisibleIdentitySource.exceptions.length===0||
 collidingVisibleIdentityRow.sourceOrganizationId===collidingVisibleIdentitySource.sourceOrganizationId||
 collidingVisibleIdentityRow.invoiceId!==collidingVisibleIdentitySource.invoiceId||
 collidingVisibleIdentityRow.allocationId!==collidingVisibleIdentitySource.allocationId) {
 throw new Error('same_visible_exception_identity_probe_is_vacuous');
}
const collisionIdentity=`${collidingVisibleIdentitySource.invoiceId}:${collidingVisibleIdentitySource.allocationId}`;
const collisionCountsBefore=Object.fromEntries(collidingVisibleIdentitySource.exceptions.map(code=>[code,
 collidingVisibleIdentityPayload.exceptions.filter(row=>row.category==='invoice'&&row.identity===collisionIdentity&&row.code===code).length]));
if(!Object.values(collisionCountsBefore).every(count=>count===1)) {
 throw new Error('same_visible_exception_identity_baseline_multiplicity_failed');
}
collidingVisibleIdentityPayload.invoices.push(collidingVisibleIdentityRow);
rebuildTopExceptions(collidingVisibleIdentityPayload);
sortProjectorRows(collidingVisibleIdentityPayload);
const collidingNestedRows=collidingVisibleIdentityPayload.invoices.filter(row=>row.invoiceId===collidingVisibleInvoiceId&&
 row.allocationId===collidingVisibleAllocationId);
if(collidingNestedRows.length!==2||new Set(collidingNestedRows.map(row=>row.sourceOrganizationId)).size!==2||
 !collidingVisibleIdentitySource.exceptions.every(code=>
 collidingVisibleIdentityPayload.exceptions.filter(row=>row.category==='invoice'&&row.identity===collisionIdentity&&row.code===code).length===
  collisionCountsBefore[code]+1&&collisionCountsBefore[code]+1===2)) {
 throw new Error('same_visible_exception_identity_multiset_probe_failed');
}
for(let index=1;index<collidingVisibleIdentityPayload.invoices.length;index++){
 const previous=collidingVisibleIdentityPayload.invoices[index-1],current=collidingVisibleIdentityPayload.invoices[index];
 if(compareText(previous.invoiceId,current.invoiceId)>0||
  (previous.invoiceId===current.invoiceId&&compareText(previous.allocationId,current.allocationId)>0)) {
  throw new Error('same_visible_exception_identity_invoice_order_failed');
 }
}
assertHostileProjectorAvailable(collidingVisibleIdentityPayload,'same-visible-exception-identity-distinct-source-org');

const acl=psql(`select has_function_privilege('anon','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_function_privilege('authenticated','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_function_privilege('service_role','public.read_project_economy_step8_service_v1(text,jsonb)','EXECUTE'),
has_schema_privilege('anon','operations_step8_service_private','USAGE'),
has_table_privilege('anon','operations_step8_service_private.receipts','SELECT'),
has_function_privilege('anon','operations_step8_service_private.cleanup_expired_receipts_v1(timestamptz)','EXECUTE'),
has_function_privilege('anon','operations_step8_service_private.canonical_json_v1(jsonb)','EXECUTE');`).trim();
if(acl!=='t|f|f|f|f|f|f') throw new Error(`service_acl_failed:${acl}`);
console.log(JSON.stringify({status:'PASS',schema:'eventflow.operations.project-economy-read-response.v1',migrationSha256,
 postgresRuntime:true,assertions:{parentProjectorRuntime:true,signedConflict:true,availableExactProjector:true,missingRateNull:true,
 linkedCredit:true,financeFlagsFalse:true,concurrentReplay16:true,byteIdenticalReplay:true,
 invalidSignatureWrites0:true,nullSignatureDenied28000:true,headerTypesFailClosed:true,actorRequestIdSwapDenied:true,
 crossTupleDenied:true,ttlFutureDenied:true,duplicateCanonicalDenied:true,
 nonceCollisionUnsigned23505:true,receiptImmutable:true,ownerExpiredCleanup:true,
 requestResponseEnrollmentRevocationDenied:true,directionalKeySeparation:true,exact500:true,overflow501Unavailable:true,
 anonOnlyExecute:true,privateDirectSelectDenied:true,canonicalPrivateDenied:true,canonicalProcContract:true,
 depthProcContract:true,privateHelperDirectDenied:true,productionCanonicalVectors:true,exactRequestScalars:true,
 deepRequestWrites0:true,projectorPayloadContract:true,hostileProjectorSignedUnavailable:true,
 payloadRootMissingExtraRejected:true,exactV2InvoiceAndCreditFixtures:true,v2WrongSignsRejected:true}},null,2));
