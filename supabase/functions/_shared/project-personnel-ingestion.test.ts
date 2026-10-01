import { describe,it,expect } from 'vitest';
import { fixture, context } from './project-personnel-cost.test.ts';
import { buildPersonnelPublication,verifyTimePersonnelRead,type TimePersonnelRead,type PersonnelCurrentPublication } from './project-personnel-ingestion.ts';
import { rawBodySha256,signFinancePersonnelRequest,verifyPersonnelTransportReceipt,dispatchPersonnelOutboxClaim,type PersonnelOutboxClaim } from './project-personnel-ingestion-transport.ts';
import { createPersonnelPublishHandler } from '../project-personnel-cost-publish/handler.ts';
const ctx=context();
const binding={organization_id:ctx.organization_id,worker_id:ctx.worker_id,time_organization_id:ctx.time_organization_id,
  time_auth_worker_id:ctx.time_auth_worker_id,time_personnel_id:'99999999-9999-4999-8999-999999999999',time_source_system:'time' as const,
  external_personnel_id:ctx.worker_id,enabled:true};
const empty:PersonnelCurrentPublication={current_revision:0,cost_snapshot:null,raw_time_snapshot:null,source_evidence:null};
async function read():Promise<TimePersonnelRead>{const snapshot=await fixture();const rawSnapshot=JSON.stringify(snapshot);return{
  schema:'time-project-economy-read-response.v1',snapshot,rawSnapshot,rawSnapshotSha256:await rawBodySha256(rawSnapshot),metadata:{
    organizationId:snapshot.organizationId,staffAuthUserId:snapshot.workerId,personnelId:binding.time_personnel_id,sourceSystem:'time',externalPersonnelId:binding.worker_id,
    submissionId:snapshot.id,version:snapshot.version,snapshotHash:snapshot.snapshotHash,persistedAt:'2026-10-01T12:00:00Z',persistedSyncState:'synced',
    previousSubmissionId:null,projectReview:{decisionSequence:0,status:'pending',snapshotHash:null},payrollReview:null,
    latestSubmissionId:snapshot.id,latestVersion:snapshot.version,submissionState:'submitted',submissionDecisionSequence:0}};}
describe('authenticated source binding and publication sequencing',()=>{
  it('rejects cross-tenant, auth-worker and profile substitutions and stale source head',async()=>{
    for(const field of ['organizationId','staffAuthUserId','personnelId','externalPersonnelId','latestSubmissionId']){
      const r=await read();(r.metadata as any)[field]='88888888-8888-4888-8888-888888888888';
      await expect(verifyTimePersonnelRead(r,binding,r.snapshot.id)).rejects.toThrow('unauthorized_or_stale_time_read');}
  });
  it('rejects changed raw bytes, schema version and project decision for another snapshot',async()=>{
    const r=await read();r.rawSnapshot+=' ';await expect(verifyTimePersonnelRead(r,binding,r.snapshot.id)).rejects.toThrow();
    const approved=await read();approved.metadata.projectReview={status:'approved',decisionSequence:1,snapshotHash:'0'.repeat(64)};
    await expect(verifyTimePersonnelRead(approved,binding,approved.snapshot.id)).rejects.toThrow();
  });
  it('initially calculates only in Operations and repeated source event is unchanged',async()=>{
    const r=await read();const p=await buildPersonnelPublication({read:r,binding,current:empty,allocations:ctx.allocations,rates:ctx.rates});
    expect(p!.snapshot.lines[0].amount_minor).toBe(60000);expect(p!.snapshot.source_revision).toBe(1);
    expect(p!.sourceEvidence.raw_snapshot).toBe(r.rawSnapshot);
    expect(await buildPersonnelPublication({read:r,binding,current:{current_revision:1,cost_snapshot:p!.snapshot,raw_time_snapshot:r.snapshot,source_evidence:p!.sourceEvidence},allocations:[],rates:[]})).toBeNull();
  });
  it('attests the saved rate despite changed current rates and payroll metadata',async()=>{
    const r=await read(),p=(await buildPersonnelPublication({read:r,binding,current:empty,allocations:ctx.allocations,rates:ctx.rates}))!;
    r.metadata.projectReview={decisionSequence:7,status:'approved',snapshotHash:r.snapshot.snapshotHash};r.metadata.payrollReview={status:'approved'};
    const approved=await buildPersonnelPublication({read:r,binding,current:{current_revision:1,cost_snapshot:p.snapshot,raw_time_snapshot:r.snapshot,source_evidence:p.sourceEvidence},allocations:[],rates:[{...ctx.rates[0],hourly_rate_minor:99999}]});
    expect(approved!.snapshot.lines[0]).toMatchObject({amount_minor:60000,hourly_rate_minor:30000,status:'confirmed'});expect(approved!.snapshot.source_revision).toBe(2);
  });
  it('global correction request overrides a stale project approval and void rejects saved costs',async()=>{
    const r=await read();r.metadata.projectReview={decisionSequence:7,status:'approved',snapshotHash:r.snapshot.snapshotHash};
    r.metadata.submissionState='correction_requested';r.metadata.submissionDecisionSequence=8;
    const p=(await buildPersonnelPublication({read:r,binding,current:empty,allocations:ctx.allocations,rates:ctx.rates}))!;
    expect(p.snapshot.lines[0].status).toBe('preliminary');r.metadata.submissionState='voided';r.metadata.submissionDecisionSequence=9;
    const rejected=await buildPersonnelPublication({read:r,binding,current:{current_revision:1,cost_snapshot:p.snapshot,raw_time_snapshot:r.snapshot,source_evidence:p.sourceEvidence},allocations:[],rates:[]});
    expect(rejected!.snapshot.lines[0]).toMatchObject({status:'rejected',amount_minor:60000});
  });
});
const claim:PersonnelOutboxClaim={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',organization_id:ctx.organization_id,source_time_stream_id:'stream-v1',source_revision:1,
  raw_body:'{}',body_sha256:'',destination_organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key_id:'fixture-ops-v1',
  endpoint_url:'https://localhost:55501/functions/v1/operations-personnel-cost-receive',lease_owner:'worker-v1',lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const receipt=()=>({schema:'operations-personnel-cost-receipt-v1',outcome:'accepted',source_organization_id:claim.organization_id,
  source_time_stream_id:claim.source_time_stream_id,requested_source_revision:1,applied_source_revision:1,current_source_revision:1,
  request_body_sha256:claim.body_sha256,snapshot_receipt_id:claim.id,snapshot_fingerprint:'1'.repeat(64),receipt_id:claim.id,
  destination_organization_id:claim.destination_organization_id,shadow_only:true});
describe('immutable Finance transport acknowledgements',()=>{
  it('signs exact raw bytes with route and schema purpose; fresh attempts get fresh nonce',async()=>{
    const h=await signFinancePersonnelRequest('{ "value": 1 }',claim.key_id,'x'.repeat(32),{now:new Date('2026-10-01T12:00:00Z'),nonce:'fixture_nonce_123456'});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('x'.repeat(32)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const bytes=Uint8Array.from(h['x-eventflow-signature'].slice(3).match(/../g)!,s=>parseInt(s,16));
    const string=['POST','operations-personnel-cost-receive','operations-personnel-cost-v1',claim.key_id,h['x-eventflow-timestamp'],h['x-eventflow-nonce'],'{ "value": 1 }'].join('\n');
    expect(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(string))).toBe(true);
    const a=await signFinancePersonnelRequest('{}',claim.key_id,'x'.repeat(32)),b=await signFinancePersonnelRequest('{}',claim.key_id,'x'.repeat(32));expect(a['x-eventflow-nonce']).not.toBe(b['x-eventflow-nonce']);
  });
  it('binds acknowledgements to every stream/tenant/revision/body and distinguishes historical replay',async()=>{
    claim.body_sha256=await rawBodySha256(claim.raw_body);
    expect(verifyPersonnelTransportReceipt({...receipt(),outcome:'replayed',current_source_revision:2},claim,200).applied_source_revision).toBe(1);
    for(const field of ['outcome','source_organization_id','source_time_stream_id','request_body_sha256','destination_organization_id','shadow_only'])
      expect(()=>verifyPersonnelTransportReceipt({...receipt(),[field]:null},claim,200)).toThrow();
    expect(()=>verifyPersonnelTransportReceipt({...receipt(),extra:true},claim,200)).toThrow();
    expect(verifyPersonnelTransportReceipt({...receipt(),outcome:'stale',applied_source_revision:2,current_source_revision:2},claim,409).outcome).toBe('stale');
    expect(()=>verifyPersonnelTransportReceipt({...receipt(),outcome:'stale'},claim,409)).toThrow();
  });
  it('timeout or malformed success remains retryable; disabled configuration does not send',async()=>{
    claim.body_sha256=await rawBodySha256(claim.raw_body);const cfg={enabled:true,endpoint:claim.endpoint_url,keyId:claim.key_id,secret:'x'.repeat(32)};
    expect(await dispatchPersonnelOutboxClaim(claim,cfg,async()=>{throw new Error('lost response after commit');})).toEqual({outcome:'retry',error:'finance_ack_unknown'});
    expect((await dispatchPersonnelOutboxClaim(claim,cfg,async()=>new Response('{}',{status:200}))).outcome).toBe('retry');
    let sent=false;expect((await dispatchPersonnelOutboxClaim(claim,{...cfg,enabled:false},async()=>{sent=true;return new Response();})).outcome).toBe('blocked');expect(sent).toBe(false);
  });
  it('internal ingestion is disabled by default and rejects unauthenticated calls before any service reads',async()=>{
    const cfg={enabled:false,internalSecret:'x'.repeat(32),databaseUrl:'http://localhost',databaseServiceKey:'unused',timeEndpoint:'',timeSigningSeed:'',finance:{enabled:false,endpoint:'',keyId:'',secret:''}};
    expect((await createPersonnelPublishHandler(cfg)(new Request('https://localhost',{method:'POST'}))).status).toBe(503);
    expect((await createPersonnelPublishHandler({...cfg,enabled:true})(new Request('https://localhost',{method:'POST'}))).status).toBe(401);
  });
});
