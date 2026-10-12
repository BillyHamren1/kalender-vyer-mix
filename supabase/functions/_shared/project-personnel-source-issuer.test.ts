import {describe,it,expect} from 'vitest';
import {createHmac} from 'node:crypto';
import {fixture,context} from './project-personnel-cost.test.ts';
import {preparePersonnelIssuerCommand,type PersonnelIssuerConfiguration} from './project-personnel-source-issuer.ts';
import {rawBodySha256} from './project-personnel-ingestion-transport.ts';
const ctx=context();
const cfg:PersonnelIssuerConfiguration={enabled:true,issuerId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',enrollmentEpoch:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',destinationOrganizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',issuerSecret:'fixture-separate-operations-issuer-key-only',databaseUrl:'https://ops.invalid',databaseServiceKey:'fixture-service',timeEndpoint:'https://time.invalid/functions/v1/time-project-economy-read',timeSigningSeed:'fixture-time-signing-seed-at-least-32-characters'};
async function setup(mutate?:(r:any)=>void){
 const snapshot=await fixture(),rawSnapshot=JSON.stringify(snapshot);
 const binding={organization_id:ctx.organization_id,worker_id:ctx.worker_id,time_organization_id:ctx.time_organization_id,time_auth_worker_id:ctx.time_auth_worker_id,time_personnel_id:'99999999-9999-4999-8999-999999999999',time_source_system:'time',external_personnel_id:ctx.worker_id,enabled:true};
 const response={schema:'time-project-economy-read-response.v1',snapshot,rawSnapshot,rawSnapshotSha256:await rawBodySha256(rawSnapshot),metadata:{organizationId:snapshot.organizationId,staffAuthUserId:snapshot.workerId,personnelId:binding.time_personnel_id,sourceSystem:'time',externalPersonnelId:ctx.worker_id,submissionId:snapshot.id,version:snapshot.version,snapshotHash:snapshot.snapshotHash,persistedAt:'2026-10-01T12:00:00Z',persistedSyncState:'synced',previousSubmissionId:null,projectReview:{decisionSequence:0,status:'pending',snapshotHash:null},payrollReview:null,latestSubmissionId:snapshot.id,latestVersion:snapshot.version,submissionState:'submitted',submissionDecisionSequence:0}};
 mutate?.(response);const calls:string[]=[];
 const fetcher:typeof fetch=async(url,init)=>{const u=new URL(String(url));calls.push(u.pathname);
  let body:unknown;
  if(u.hostname==='time.invalid'){expect(new Headers(init?.headers).get('x-project-economy-service-proof')).toBeTruthy();body=response;}
  else if(u.pathname.endsWith('/operations_personnel_source_bindings'))body=[binding];
  else if(u.pathname.endsWith('/operations_personnel_cost_streams'))body=[];
  else if(u.pathname.endsWith('/operations_personnel_target_bindings'))body=[ctx.allocations[0]];
  else if(u.pathname.endsWith('/operations_personnel_accepted_rate_history_v1'))body=ctx.rates;
  else throw new Error('Unexpected URL '+u.pathname);
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 return {input:{organizationId:ctx.organization_id,workerId:ctx.worker_id,submissionId:snapshot.id},fetcher,calls,response};
}
describe('dedicated dormant Operations source issuer',()=>{
 it('is disabled before network reads and never falls back to generic service key',async()=>{
  const s=await setup();await expect(preparePersonnelIssuerCommand({...cfg,enabled:false},s.input,s.fetcher)).rejects.toThrow('issuer_disabled');
  await expect(preparePersonnelIssuerCommand({...cfg,issuerSecret:''},s.input,s.fetcher)).rejects.toThrow('configuration');expect(s.calls).toEqual([]);
 });
 it('signs exact actual read, calculated amount, stream CAS and dedicated identity',async()=>{
  const s=await setup(),r=(await preparePersonnelIssuerCommand(cfg,s.input,s.fetcher))!;const c=JSON.parse(r.body);
  expect(c.snapshot.lines[0].amount_minor).toBe(60000);expect(c.raw_time_snapshot).toEqual(s.response.snapshot);expect(c.expected_revision).toBe(0);expect(c.snapshot.source_revision).toBe(1);
  expect(c.source_evidence.raw_snapshot).toBe(s.response.rawSnapshot);expect(c.issuer_id).toBe(cfg.issuerId);expect(c.destination_organization_id).toBe(cfg.destinationOrganizationId);
  expect(r.signature).toBe(createHmac('sha256',cfg.issuerSecret).update(['operations-personnel-source-attestation.v1',r.timestamp,r.nonce,r.body].join('\n')).digest('hex'));
  expect(s.calls.filter(p=>p.includes('/rpc/'))).toEqual([]);
 });
 it('rejects failed or malformed Time responses before producing an attestation',async()=>{
  for(const reply of [()=>new Response('{}',{status:403}),()=>new Response('not-json'),()=>{throw new Error('synthetic network failure')}]){
   const s=await setup();const broken:typeof fetch=async(url,init)=>new URL(String(url)).hostname==='time.invalid'?reply():s.fetcher(url,init);
   await expect(preparePersonnelIssuerCommand(cfg,s.input,broken)).rejects.toThrow();
   expect(s.calls.some(p=>p.endsWith('/operations_personnel_cost_streams'))).toBe(false);
  }
 });
 it('requires issued ancestry before reusing same-version frozen money',async()=>{
  for(const accepted of [false,true]){
   const s=await setup();const initial=JSON.parse((await preparePersonnelIssuerCommand(cfg,s.input,s.fetcher))!.body);
   s.response.metadata.submissionDecisionSequence=1;
   const previous:typeof fetch=async(url,init)=>{const p=new URL(String(url)).pathname;let body:unknown;
    if(p.endsWith('/operations_personnel_cost_streams'))body=[{current_revision:1}];
    else if(p.endsWith('/operations_personnel_cost_publications'))body=[{cost_snapshot:initial.snapshot,raw_time_snapshot:initial.raw_time_snapshot}];
    else if(p.endsWith('/operations_personnel_cost_outbox'))body=[{source_evidence:initial.source_evidence}];
    else if(p.endsWith('/get_operations_personnel_issued_ancestor_v1'))body=accepted;
    else return s.fetcher(url,init);
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
   };
   if(!accepted)await expect(preparePersonnelIssuerCommand(cfg,s.input,previous)).rejects.toThrow('unissued_same_version_ancestor');
   else {const c=JSON.parse((await preparePersonnelIssuerCommand(cfg,s.input,previous))!.body);expect(c.expected_revision).toBe(1);expect(c.snapshot.lines[0].amount_minor).toBe(60000);}
  }
 });
 it('never signs a foreign/stale response or altered raw bytes',async()=>{
  for(const mutate of [(r:any)=>r.metadata.organizationId=cfg.issuerId,(r:any)=>r.metadata.latestVersion++, (r:any)=>r.rawSnapshot+=' ']){
   const s=await setup(mutate);await expect(preparePersonnelIssuerCommand(cfg,s.input,s.fetcher)).rejects.toThrow('unauthorized_or_stale_time_read');
   expect(s.calls.some(p=>p.endsWith('/operations_personnel_cost_streams'))).toBe(false);
  }
 });
});

import {createPersonnelPublishHandler,type PersonnelPublishConfig} from '../project-personnel-cost-publish/handler.ts';
const ingestSecret='fixture-ingest-server-only-secret-long-enough';
const handlerConfig=(fetchImpl:typeof fetch):PersonnelPublishConfig=>({...cfg,internalSecret:ingestSecret,finance:{enabled:false,endpoint:'',keyId:'',secret:''},fetchImpl,
 accepted:{enabled:true,issuerId:cfg.issuerId,enrollmentEpoch:cfg.enrollmentEpoch,destinationOrganizationId:cfg.destinationOrganizationId,issuerSecret:cfg.issuerSecret,
 transport:{enabled:false,issuerId:cfg.issuerId,enrollmentEpoch:cfg.enrollmentEpoch,endpoint:'https://finance.invalid/functions/v1/operations-personnel-accepted-receive',secret:'fixture-delivery-key-different-from-source-secret'}}});
const acceptedMode={mode:'accepted',issuer_id:cfg.issuerId,enrollment_epoch:cfg.enrollmentEpoch,destination_organization_id:cfg.destinationOrganizationId};
const requestFor=(input:{organizationId:string;workerId:string;submissionId:string},extra={})=>new Request('https://ops.invalid/publish',{method:'POST',headers:{authorization:'Bearer '+ingestSecret},body:JSON.stringify({operation:'ingest',organization_id:input.organizationId,worker_id:input.workerId,submission_id:input.submissionId,...extra})});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
describe('default-off accepted caller connection',()=>{
 it('performs no network when disabled, unauthenticated or request tries to choose issuer',async()=>{
  const s=await setup(),handler=createPersonnelPublishHandler(handlerConfig(s.fetcher));
  expect((await createPersonnelPublishHandler({...handlerConfig(s.fetcher),enabled:false})(requestFor(s.input))).status).toBe(503);
  const noAuth=requestFor(s.input);noAuth.headers.delete('authorization');expect((await handler(noAuth)).status).toBe(401);
  expect((await handler(requestFor(s.input,{issuer_id:cfg.issuerId}))).status).toBe(400);expect(s.calls).toEqual([]);
 });
 it('never reads Time or invokes legacy publisher for blocked, disabled or mismatched accepted mode',async()=>{
  for(const mode of [{mode:'blocked'},acceptedMode,{...acceptedMode,enrollment_epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]){
   const s=await setup(),calls:string[]=[];const fetcher:typeof fetch=async(u)=>{calls.push(String(u));expect(String(u)).toContain('/get_operations_personnel_publish_mode_v1');return reply(mode);};
   const config=handlerConfig(fetcher);if(mode===acceptedMode)config.accepted!.enabled=false;
   expect((await createPersonnelPublishHandler(config)(requestFor(s.input))).status).toBe(503);expect(calls).toHaveLength(1);expect(s.calls).toEqual([]);
  }
 });
 it('reuses one verified Time read across exactly three signed SQLSTATE40001 CAS attempts',async()=>{
  const s=await setup(),commands:any[]=[];
  const fetcher:typeof fetch=async(u,init)=>{const path=new URL(String(u)).pathname;
   if(path.endsWith('/get_operations_personnel_publish_mode_v1'))return reply(acceptedMode);
   if(path.endsWith('/issue_operations_personnel_accepted_v1')){const r=JSON.parse(String(init?.body));commands.push(r);return reply({code:'40001',message:'issuer_publication_not_accepted'},409);}
   return s.fetcher(u,init);
  };
  expect((await createPersonnelPublishHandler(handlerConfig(fetcher))(requestFor(s.input))).status).toBe(409);
  expect(commands).toHaveLength(3);expect(new Set(commands.map(c=>c.p_nonce)).size).toBe(3);
  for(const r of commands){expect(r.p_signature).toBe(createHmac('sha256',cfg.issuerSecret).update(['operations-personnel-source-attestation.v1',r.p_timestamp,r.p_nonce,r.p_body].join('\n')).digest('hex'));expect(JSON.parse(r.p_body).raw_time_snapshot).toEqual(s.response.snapshot);}
  expect(s.calls.filter(p=>p.includes('time-project-economy-read'))).toHaveLength(1);
  expect(s.calls.filter(p=>p.endsWith('/operations_personnel_cost_streams'))).toHaveLength(3);
 });
 it('does not retry authorization failures or turn an absent new-day enrollment into shadow',async()=>{
  for(const missingDay of [false,true]){
   const s=await setup();let issues=0,modeCalls=0;
   const fetcher:typeof fetch=async(u,init)=>{const path=new URL(String(u)).pathname;
    if(path.endsWith('/get_operations_personnel_publish_mode_v1')){modeCalls++;return reply(missingDay&&modeCalls===2?{mode:'blocked',reason:'accepted_stream_bootstrap_required'}:acceptedMode);}
    if(path.endsWith('/issue_operations_personnel_accepted_v1')){issues++;return reply({code:'42501'},403);}
    return s.fetcher(u,init);
   };
   expect((await createPersonnelPublishHandler(handlerConfig(fetcher))(requestFor(s.input))).status).toBe(503);expect(issues).toBe(missingDay?0:1);
  }
 });
 it('ambiguous committed response is resolved by issued immutable ancestry without another publication',async()=>{
  const s=await setup();let committed:any=null,issues=0;
  const fetcher:typeof fetch=async(u,init)=>{const p=new URL(String(u)).pathname;
   if(p.endsWith('/get_operations_personnel_publish_mode_v1'))return reply(acceptedMode);
   if(p.endsWith('/issue_operations_personnel_accepted_v1')){issues++;committed=JSON.parse(JSON.parse(String(init?.body)).p_body);throw new Error('lost committed response');}
   if(committed){if(p.endsWith('/operations_personnel_cost_streams'))return reply([{current_revision:1}]);if(p.endsWith('/operations_personnel_cost_publications'))return reply([{cost_snapshot:committed.snapshot,raw_time_snapshot:committed.raw_time_snapshot}]);if(p.endsWith('/operations_personnel_cost_outbox'))return reply([{source_evidence:committed.source_evidence}]);if(p.endsWith('/get_operations_personnel_issued_ancestor_v1'))return reply(true);}
   return s.fetcher(u,init);
  };
  const handler=createPersonnelPublishHandler(handlerConfig(fetcher));expect((await handler(requestFor(s.input))).status).toBe(503);
  const retry=await handler(requestFor(s.input));expect(retry.status).toBe(200);expect((await retry.json()).status).toBe('unchanged');expect(issues).toBe(1);
 });
});

describe('accepted caller installation and key isolation',()=>{
 it('rejects a source or delivery key reused from database credentials before any network',async()=>{
  for(const target of ['issuer','delivery'])for(const otherKey of ['databaseServiceKey','shadowSecret']){
   const s=await setup(),config=handlerConfig(s.fetcher);config.databaseServiceKey='fixture-database-service-key-long-enough';config.finance.secret='fixture-legacy-shadow-transport-secret-long';
   const reused=otherKey==='databaseServiceKey'?config.databaseServiceKey:config.finance.secret;
   if(target==='issuer')config.accepted!.issuerSecret=reused;else{config.accepted!.transport.enabled=true;config.accepted!.transport.secret=reused;}
   expect((await createPersonnelPublishHandler(config)(requestFor(s.input))).status).toBe(503);expect(s.calls).toEqual([]);
  }
 });
 it('requires installed mode RPC even for legacy; missing permission is never fallback',async()=>{
  const s=await setup();let published=0;
  const fetcher:typeof fetch=async(u,init)=>{const p=new URL(String(u)).pathname;
   if(p.endsWith('/get_operations_personnel_publish_mode_v1'))return reply({mode:'legacy'});
   if(p.endsWith('/publish_operations_personnel_cost_ingress_v1')){published++;return reply({status:'accepted',source_revision:1});}
   return s.fetcher(u,init);
  };
  const config=handlerConfig(fetcher);config.accepted!.enabled=false;
  expect((await createPersonnelPublishHandler(config)(requestFor(s.input))).status).toBe(200);expect(published).toBe(1);
  const denied:typeof fetch=async(u)=>{expect(String(u)).toContain('/get_operations_personnel_publish_mode_v1');return reply({code:'42501'},403);};
  expect((await createPersonnelPublishHandler({...config,fetchImpl:denied})(requestFor(s.input))).status).toBe(503);expect(published).toBe(1);
 });
});

describe('accepted dispatcher caller',()=>{
 it('leases only configured issuer/epoch, verifies signed ACK, and finishes delivery without applying money',async()=>{
  const s=await setup(),calls:string[]=[],config=handlerConfig(s.fetcher);config.accepted!.transport.enabled=true;
  const a=config.accepted!,raw='{"isolated":"accepted-transport-caller"}',claim={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',organization_id:ctx.organization_id,source_time_stream_id:'fixture-stream',source_revision:1,raw_body:raw,body_sha256:await rawBodySha256(raw),destination_organization_id:cfg.destinationOrganizationId,issuer_id:cfg.issuerId,enrollment_epoch:cfg.enrollmentEpoch,endpoint_url:a.transport.endpoint,lease_owner:'',lease_token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};
  config.fetchImpl=async(u,init)=>{const path=new URL(String(u)).pathname;calls.push(path);const body=JSON.parse(String(init?.body));
   if(path.endsWith('/claim_operations_personnel_accepted_v1')){expect(body).toEqual({p_issuer:cfg.issuerId,p_epoch:cfg.enrollmentEpoch,p_owner:expect.any(String),p_limit:1,p_lease_seconds:60});claim.lease_owner=body.p_owner;return reply([claim]);}
   if(path.endsWith('/operations-personnel-accepted-receive')){expect(new Headers(init?.headers).get('x-eventflow-issuer-id')).toBe(cfg.issuerId);const raw_ack=JSON.stringify({schema:'operations-personnel-accepted-receipt.v1',outcome:'received',issuer_id:claim.issuer_id,enrollment_epoch:claim.enrollment_epoch,source_organization_id:claim.organization_id,destination_organization_id:claim.destination_organization_id,source_stream_id:claim.source_time_stream_id,source_revision:1,outbox_id:claim.id,envelope_sha256:claim.body_sha256,receipt_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',financially_applied:false});return reply({raw_ack,signature:createHmac('sha256',a.transport.secret).update('operations-personnel-accepted-ack.v1\n'+raw_ack).digest('hex')});}
   if(path.endsWith('/finish_operations_personnel_accepted_v1')){expect(body.p_outcome).toBe('delivered');expect(JSON.parse(body.p_raw_ack).financially_applied).toBe(false);return reply({status:'delivered',financially_applied:false});}
   throw new Error('unexpected operation '+path);
  };
  const response=await createPersonnelPublishHandler(config)(new Request('https://ops.invalid/publish',{method:'POST',headers:{authorization:'Bearer '+ingestSecret},body:JSON.stringify({operation:'dispatch',limit:1})}));
  expect(response.status).toBe(200);expect((await response.json()).financially_applied).toBe(false);expect(calls).toEqual(['/rest/v1/rpc/claim_operations_personnel_accepted_v1','/functions/v1/operations-personnel-accepted-receive','/rest/v1/rpc/finish_operations_personnel_accepted_v1']);
 });
});

describe('prospective revision-zero canonical head',()=>{
 it('prepares first accepted CAS from explicit empty head without bootstrap or shadow calls',async()=>{
  const s=await setup();const urls:URL[]=[];
  const f:typeof fetch=async(u,i)=>{const url=new URL(String(u));urls.push(url);
   if(url.pathname.endsWith('/operations_personnel_cost_streams'))return new Response(JSON.stringify([{current_revision:0}]));
   if(url.pathname.endsWith('/operations_personnel_cost_publications')||url.pathname.endsWith('/operations_personnel_cost_outbox'))return new Response('[]');
   return s.fetcher(u,i);
  };
  const r=(await preparePersonnelIssuerCommand(cfg,s.input,f))!;expect(JSON.parse(r.body).expected_revision).toBe(0);
  expect(urls.filter(u=>/cost_publications|cost_outbox/.test(u.pathname)).every(u=>!u.searchParams.has('source_revision'))).toBe(true);
  expect(urls.some(u=>u.pathname.includes('/rpc/'))).toBe(false);
 });
 it.each(['0',null,-1,0.5,Number.MAX_SAFE_INTEGER+1])('rejects malformed revision %s',async revision=>{
  const s=await setup();const f:typeof fetch=async(u,i)=>String(u).includes('/operations_personnel_cost_streams')?new Response(JSON.stringify([{current_revision:revision}])):s.fetcher(u,i);
  await expect(preparePersonnelIssuerCommand(cfg,s.input,f)).rejects.toThrow('invalid_stream_revision');
 });
 it.each(['operations_personnel_cost_publications','operations_personnel_cost_outbox'])('rejects any historical evidence behind zero head: %s',async table=>{
  const s=await setup();const f:typeof fetch=async(u,i)=>{const p=new URL(String(u)).pathname;
   if(p.endsWith('/operations_personnel_cost_streams'))return new Response('[{"current_revision":0}]');
   if(p.endsWith('/'+table))return new Response('[{"source_revision":7}]');
   if(/cost_publications|cost_outbox/.test(p))return new Response('[]');return s.fetcher(u,i);
  };await expect(preparePersonnelIssuerCommand(cfg,s.input,f)).rejects.toThrow('zero_stream_has_evidence');
 });
});
