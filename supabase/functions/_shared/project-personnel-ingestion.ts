import { calculatePersonnelCostSnapshot, revisePersonnelCostReview, type FrozenTimeSnapshot,
  type HistoricalPersonnelRate, type PersonnelCostSnapshot, type ResolvedAllocation } from './project-personnel-cost.ts';
import { deriveSigningKeyFromSeed, base64url } from './timeServiceProof.ts';
import { rawBodySha256 } from './project-personnel-ingestion-transport.ts';

export interface PersonnelSourceBinding {
  organization_id: string; worker_id: string; time_organization_id: string; time_auth_worker_id: string;
  time_personnel_id: string; time_source_system: 'time'|'planning'; external_personnel_id: string; enabled: boolean;
}
export interface TimePersonnelRead {
  schema: 'time-project-economy-read-response.v1'; snapshot: FrozenTimeSnapshot;
  rawSnapshot: string; rawSnapshotSha256: string;
  metadata: {
    organizationId: string; staffAuthUserId: string; personnelId: string; sourceSystem: string;
    externalPersonnelId: string; submissionId: string; version: number; snapshotHash: string;
    persistedAt: string; persistedSyncState: 'synced'; previousSubmissionId: string|null;
    projectReview: { decisionSequence: number; status: 'pending'|'approved'|'locked'|'reopened'; snapshotHash: string|null };
    payrollReview: unknown; latestSubmissionId: string; latestVersion: number;
    submissionState: 'submitted'|'correction_requested'|'approved'|'locked'|'voided'; submissionDecisionSequence: number;
  };
}
export interface PersonnelSourceEvidence {
  schema: 'operations-personnel-source-evidence-v1'; personnel_id: string; source_system: string;
  external_personnel_id: string; project_review_sequence: number;
  project_review_status: 'preliminary'|'confirmed'|'rejected'; raw_snapshot_sha256: string; persisted_sync_state: 'synced';
  submission_state: string; submission_decision_sequence: number; raw_snapshot: string;
}
export interface PersonnelCurrentPublication {
  current_revision: number; cost_snapshot: PersonnelCostSnapshot|null;
  raw_time_snapshot: FrozenTimeSnapshot|null; source_evidence: PersonnelSourceEvidence|null;
}
const encoder = new TextEncoder();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const safe = (v: unknown, min=0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,canonical(value)])) : v;
export async function verifyTimePersonnelRead(value: unknown,binding: PersonnelSourceBinding,submissionId: string): Promise<TimePersonnelRead> {
  const r=value as TimePersonnelRead;
  const m=r?.metadata, s=r?.snapshot, review=m?.projectReview;
  if (r?.schema!=='time-project-economy-read-response.v1' || !s || !m || !review || !binding.enabled ||
    !uuid(submissionId) || ![binding.organization_id,binding.worker_id,binding.time_organization_id,binding.time_auth_worker_id,binding.time_personnel_id].every(uuid) ||
    m.organizationId!==binding.time_organization_id || m.staffAuthUserId!==binding.time_auth_worker_id ||
    m.personnelId!==binding.time_personnel_id || m.sourceSystem!==binding.time_source_system ||
    m.externalPersonnelId!==binding.external_personnel_id || m.persistedSyncState!=='synced' ||
    m.submissionId!==submissionId || s.id!==submissionId || m.organizationId!==s.organizationId || m.staffAuthUserId!==s.workerId ||
    m.version!==s.version || !safe(m.version,1) || m.snapshotHash!==s.snapshotHash ||
    m.latestSubmissionId!==submissionId || m.latestVersion!==s.version ||
    !safe(review.decisionSequence) || !safe(m.submissionDecisionSequence) ||
    !['submitted','correction_requested','approved','locked','voided'].includes(m.submissionState) ||
    !['pending','approved','locked','reopened'].includes(review.status) ||
    (review.decisionSequence===0 ? review.snapshotHash!==null : review.snapshotHash!==s.snapshotHash) ||
    typeof r.rawSnapshot!=='string' || encoder.encode(r.rawSnapshot).byteLength>1048576 ||
    !/^[0-9a-f]{64}$/.test(r.rawSnapshotSha256) ||
    await rawBodySha256(r.rawSnapshot)!==r.rawSnapshotSha256 ||
    JSON.stringify(canonical(JSON.parse(r.rawSnapshot)))!==JSON.stringify(canonical(s))) throw new Error('unauthorized_or_stale_time_read');
  return r;
}
export async function readAuthenticatedTimePersonnel(
  binding: PersonnelSourceBinding,submissionId: string,config: { endpoint: string; signingSeed: string },fetchImpl: typeof fetch=fetch,
): Promise<TimePersonnelRead> {
  const url=new URL(config.endpoint);
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash ||
    !url.pathname.endsWith('/functions/v1/time-project-economy-read')) throw new Error('untrusted_time_endpoint');
  const body=JSON.stringify({schema:'time-project-economy-read.v1',operation:'submissions.read',organizationId:binding.time_organization_id,
    staffAuthUserId:binding.time_auth_worker_id,personnelId:binding.time_personnel_id,submissionId});
  const signer=await deriveSigningKeyFromSeed(config.signingSeed),iat=Math.floor(Date.now()/1000);
  const claims={schema:'time-project-economy-service-proof.v1',iss:'eventflow-operations',aud:'eventflow-time-project-economy-read',
    operation:'submissions.read',organizationId:binding.time_organization_id,method:'POST',route:'time-project-economy-read',iat,exp:iat+60,
    nonce:crypto.randomUUID(),bodySha256:await rawBodySha256(body)};
  const part=(v:unknown)=>base64url(encoder.encode(JSON.stringify(v)));
  const unsigned=part({alg:'ES256',typ:'JWT',kid:signer.keyId})+'.'+part(claims);
  const proof=unsigned+'.'+base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.key,encoder.encode(unsigned)));
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json','x-project-economy-service-proof':proof},body,
    redirect:'error',signal:AbortSignal.timeout(10000)});
  if (response.status!==200) { await response.body?.cancel(); throw new Error('time_read_http_'+response.status); }
  const reader=response.body?.getReader(); if(!reader)throw new Error('time_read_empty');
  let bytes=new Uint8Array();
  while(true){const chunk=await reader.read();if(chunk.done)break;if(bytes.length+chunk.value.length>2097152){await reader.cancel();throw new Error('time_read_too_large');}
    const merged=new Uint8Array(bytes.length+chunk.value.length);merged.set(bytes);merged.set(chunk.value,bytes.length);bytes=merged;}
  return await verifyTimePersonnelRead(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),binding,submissionId);
}
export async function buildPersonnelPublication(input: {
  read: TimePersonnelRead; binding: PersonnelSourceBinding; current: PersonnelCurrentPublication;
  allocations: readonly ResolvedAllocation[]; rates: readonly HistoricalPersonnelRate[];
}): Promise<{ snapshot: PersonnelCostSnapshot; sourceEvidence: PersonnelSourceEvidence; idempotencyKey: string }|null> {
  const {read,binding,current}=input;
  await verifyTimePersonnelRead(read,binding,read.snapshot.id);
  if(!safe(current.current_revision) || current.current_revision>=Number.MAX_SAFE_INTEGER)throw new Error('publication_revision_exhausted');
  const status=read.metadata.submissionState==='voided'?'rejected':read.metadata.submissionState==='correction_requested'?'preliminary':
    ['approved','locked'].includes(read.metadata.projectReview.status)?'confirmed':'preliminary';
  const evidence:PersonnelSourceEvidence={schema:'operations-personnel-source-evidence-v1',personnel_id:binding.time_personnel_id,
    source_system:binding.time_source_system,external_personnel_id:binding.external_personnel_id,
    project_review_sequence:read.metadata.projectReview.decisionSequence,project_review_status:status,
    raw_snapshot_sha256:read.rawSnapshotSha256,persisted_sync_state:'synced',submission_state:read.metadata.submissionState,
    submission_decision_sequence:read.metadata.submissionDecisionSequence,raw_snapshot:read.rawSnapshot};
  const saved=current.cost_snapshot;
  if(saved && saved.time_snapshot_version>read.snapshot.version)throw new Error('stale_time_snapshot');
  if(saved && saved.time_snapshot_version===read.snapshot.version){
    if(saved.source_time_report_id!==read.snapshot.id || saved.source_snapshot_hash!==read.snapshot.snapshotHash ||
      !current.raw_time_snapshot || JSON.stringify(canonical(current.raw_time_snapshot))!==JSON.stringify(canonical(read.snapshot)))throw new Error('same_time_version_changed');
    if(!current.source_evidence || current.source_evidence.project_review_sequence>evidence.project_review_sequence ||
      current.source_evidence.submission_decision_sequence>evidence.submission_decision_sequence)throw new Error('stale_source_review');
    if(current.source_evidence.project_review_sequence===evidence.project_review_sequence &&
      current.source_evidence.submission_decision_sequence===evidence.submission_decision_sequence){
      if(JSON.stringify(canonical(current.source_evidence))!==JSON.stringify(canonical(evidence)))throw new Error('same_source_event_changed');
      return null;
    }
  }
  const stream=`time:${binding.time_organization_id}:${binding.time_personnel_id}:${read.snapshot.workDate}`;
  const sourceRevision=current.current_revision+1;
  const snapshot=saved && saved.time_snapshot_version===read.snapshot.version ? revisePersonnelCostReview(saved,sourceRevision,status) :
    await calculatePersonnelCostSnapshot(read.snapshot,{organization_id:binding.organization_id,time_organization_id:binding.time_organization_id,
      time_auth_worker_id:binding.time_auth_worker_id,worker_id:binding.worker_id,source_time_stream_id:stream,
      source_revision:sourceRevision,project_review_status:status,allocations:input.allocations,rates:input.rates});
  if(snapshot.source_time_stream_id!==stream || snapshot.worker_id!==binding.worker_id || snapshot.organization_id!==binding.organization_id)
    throw new Error('stream_binding_changed');
  const idempotencyKey='ops-personnel:'+await rawBodySha256(JSON.stringify([stream,read.snapshot.id,evidence.project_review_sequence,evidence.submission_decision_sequence]));
  return {snapshot,sourceEvidence:evidence,idempotencyKey};
}
