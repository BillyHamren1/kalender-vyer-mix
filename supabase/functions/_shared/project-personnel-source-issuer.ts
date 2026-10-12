/** Dormant trusted Operations issuer, not a Time response signature or Finance posting. */
import { readAuthenticatedTimePersonnel, buildPersonnelPublication } from './project-personnel-ingestion.ts';
import { createOperationsPersonnelStore } from './project-personnel-ingestion-store.ts';
export interface PersonnelIssuerConfiguration {
 enabled: boolean; issuerId: string; enrollmentEpoch: string; destinationOrganizationId: string;
 issuerSecret: string; databaseUrl: string; databaseServiceKey: string; timeEndpoint: string; timeSigningSeed: string;
}
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const encoder=new TextEncoder();
/** Open one authenticated Time read; retry preparation only re-reads Operations state. */
export async function openPersonnelIssuerSession(
 config:PersonnelIssuerConfiguration,input:{organizationId:string;workerId:string;submissionId:string},
 fetchImpl:typeof fetch=fetch,
) {
 if(!config.enabled)throw new Error('personnel_issuer_disabled');
 if(![config.issuerId,config.enrollmentEpoch,config.destinationOrganizationId,input.organizationId,input.workerId,input.submissionId].every(uuid)
  ||encoder.encode(config.issuerSecret).length<32||[config.databaseServiceKey,config.timeSigningSeed].includes(config.issuerSecret))throw new Error('invalid_personnel_issuer_configuration');
 const store=createOperationsPersonnelStore(config.databaseUrl,config.databaseServiceKey,fetchImpl);
 const binding=await store.binding(input.organizationId,input.workerId);
 // Only an actual authenticated scoped read reaches signing. A caller supplies IDs,
 // never a fabricated raw Time snapshot, cost snapshot or verified=true flag.
 const read=await readAuthenticatedTimePersonnel(binding,input.submissionId,{endpoint:config.timeEndpoint,signingSeed:config.timeSigningSeed},fetchImpl);
 const stream=`time:${binding.time_organization_id}:${binding.time_personnel_id}:${read.snapshot.workDate}`;
 return {stream, prepare:async()=>{
 const current=await store.current(binding.organization_id,stream);
 const sameVersion=current.cost_snapshot?.time_snapshot_version===read.snapshot.version;
 if(sameVersion && await store.issuedAncestor(binding.organization_id,stream,current.current_revision,config.issuerId,config.enrollmentEpoch)!==true)
  throw new Error('unissued_same_version_ancestor');
 const [allocations,rates]=sameVersion?[[],[]]:await Promise.all([
  store.allocations(binding.organization_id,read),store.rates(binding.organization_id,binding.worker_id,read.snapshot.workDate)]);
 const publication=await buildPersonnelPublication({read,binding,current,allocations,rates});
 if(!publication)return {command:null,currentRevision:current.current_revision};
 const body=JSON.stringify({schema:'operations-personnel-issuer-command.v1',issuer_id:config.issuerId,enrollment_epoch:config.enrollmentEpoch,
  organization_id:binding.organization_id,destination_organization_id:config.destinationOrganizationId,source_stream_id:stream,
  expected_revision:current.current_revision,idempotency_key:publication.idempotencyKey,snapshot:publication.snapshot,
  raw_time_snapshot:read.snapshot,source_evidence:publication.sourceEvidence});
 if(encoder.encode(body).length>2097152)throw new Error('issuer_body_too_large');
 const timestamp=Math.floor(Date.now()/1000),nonce=crypto.randomUUID();
 const key=await crypto.subtle.importKey('raw',encoder.encode(config.issuerSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=['operations-personnel-source-attestation.v1',timestamp,nonce,body].join('\n');
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(signed))),b=>b.toString(16).padStart(2,'0')).join('');
 return {command:{body,timestamp,nonce,signature},currentRevision:current.current_revision};
 }};
}

/** Compatibility entry point; one-shot preparation retains the verified-read boundary. */
export async function preparePersonnelIssuerCommand(config:PersonnelIssuerConfiguration,input:{organizationId:string;workerId:string;submissionId:string},fetchImpl:typeof fetch=fetch){
 return (await (await openPersonnelIssuerSession(config,input,fetchImpl)).prepare()).command;
}
