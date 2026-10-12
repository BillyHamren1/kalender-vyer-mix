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
