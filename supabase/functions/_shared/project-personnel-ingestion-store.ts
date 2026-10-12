import {readBoundedBody} from './project-personnel-ingestion-transport.ts';
import type {AcceptedPersonnelClaim,AcceptedPersonnelDispatchResult} from './project-personnel-accepted-transport.ts';
export class OperationsPersonnelDatabaseError extends Error {constructor(readonly status:number,readonly sqlstate:string|null){super('operations_database_http_'+status);}}
import type { HistoricalPersonnelRate, ResolvedAllocation } from './project-personnel-cost.ts';
import type { PersonnelCurrentPublication, PersonnelSourceBinding, PersonnelSourceEvidence, TimePersonnelRead } from './project-personnel-ingestion.ts';
import type { PersonnelCostSnapshot } from './project-personnel-cost.ts';
import type { PersonnelOutboxClaim, PersonnelDispatchResult } from './project-personnel-ingestion-transport.ts';

/** Only the Operations service key talks to its own database. No cross-module keys. */
export function createOperationsPersonnelStore(databaseUrl: string, serviceKey: string, fetchImpl: typeof fetch=fetch) {
  const url=new URL(databaseUrl);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !serviceKey)
    throw new Error('invalid_operations_database_configuration');
  const base=url.href.replace(/\/$/,'')+'/rest/v1/';
  const request=async (path:string,params:Record<string,string>={},body?:unknown):Promise<any>=>{
    const endpoint=new URL(base+path); for(const [k,v] of Object.entries(params))endpoint.searchParams.set(k,v);
    const response=await fetchImpl(endpoint,{method:body===undefined?'GET':'POST',
      headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok){let sqlstate:string|null=null;
      try{const error=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(response.body,4096,10000)));
        if(error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code))sqlstate=error.code;
      }catch{/* Never retain database detail, SQL text or key-bearing payloads. */}
      throw new OperationsPersonnelDatabaseError(response.status,sqlstate);}

    return await response.json();
  };
  const rpc=(name:string,body:unknown)=>request('rpc/'+name,{},body);
  return {
    mode(org:string,worker:string,stream:string|null=null):Promise<{mode:'legacy'|'blocked'|'accepted';reason?:string;issuer_id?:string;enrollment_epoch?:string;destination_organization_id?:string}>{return rpc('get_operations_personnel_publish_mode_v1',{p_org:org,p_worker:worker,p_stream:stream});},
    issue(command:{body:string;timestamp:number;nonce:string;signature:string}){return rpc('issue_operations_personnel_accepted_v1',{p_body:command.body,p_timestamp:command.timestamp,p_nonce:command.nonce,p_signature:command.signature});},
    claimAccepted(issuer:string,epoch:string,owner:string):Promise<AcceptedPersonnelClaim[]>{return rpc('claim_operations_personnel_accepted_v1',{p_issuer:issuer,p_epoch:epoch,p_owner:owner,p_limit:1,p_lease_seconds:60});},
    finishAccepted(claim:AcceptedPersonnelClaim,result:AcceptedPersonnelDispatchResult){return rpc('finish_operations_personnel_accepted_v1',{p_id:claim.id,p_owner:claim.lease_owner,p_token:claim.lease_token,p_outcome:result.outcome,p_raw_ack:'receipt'in result?result.receipt.raw_ack:null,p_signature:'receipt'in result?result.receipt.signature:null,p_error:'error'in result?result.error:null});},
    async binding(org:string,worker:string):Promise<PersonnelSourceBinding>{
      const rows=await request('operations_personnel_source_bindings',{select:'*',organization_id:'eq.'+org,worker_id:'eq.'+worker,enabled:'eq.true',limit:'2'});
      if(!Array.isArray(rows)||rows.length!==1)throw new Error('source_binding_not_enabled');return rows[0];
    },
    async current(org:string,stream:string):Promise<PersonnelCurrentPublication>{
      const heads=await request('operations_personnel_cost_streams',{select:'current_revision',organization_id:'eq.'+org,source_time_stream_id:'eq.'+stream,limit:'2'});
      if(!Array.isArray(heads)||heads.length>1)throw new Error('ambiguous_stream');
      if(!heads.length)return {current_revision:0,cost_snapshot:null,raw_time_snapshot:null,source_evidence:null};
      const revision=heads[0].current_revision;
      if(!Number.isSafeInteger(revision)||revision<0)throw new Error('invalid_stream_revision');
      const revisionFilter=revision===0?{}:{source_revision:'eq.'+revision};
      const [publications,outbox]=await Promise.all([
        request('operations_personnel_cost_publications',{select:'cost_snapshot,raw_time_snapshot',organization_id:'eq.'+org,source_time_stream_id:'eq.'+stream,...revisionFilter,limit:'2'}),
        request('operations_personnel_cost_outbox',{select:'source_evidence',organization_id:'eq.'+org,source_time_stream_id:'eq.'+stream,...revisionFilter,limit:'2'}),
      ]);
      if(revision===0){
        // Revision-zero is an explicit empty canonical head, never inferred from
        // missing reports. Validated FKs tie links/proofs/reviews to publications
        // and accepted markers to outbox; checking ALL revisions rules out them too.
        if(!Array.isArray(publications)||!Array.isArray(outbox)||publications.length||outbox.length)throw new Error('zero_stream_has_evidence');
        return {current_revision:0,cost_snapshot:null,raw_time_snapshot:null,source_evidence:null};
      }
      if(publications.length!==1||outbox.length!==1)throw new Error('stream_evidence_missing');
      return {current_revision:revision,...publications[0],source_evidence:outbox[0].source_evidence};
    },
    async allocations(org:string,read:TimePersonnelRead):Promise<ResolvedAllocation[]>{
      const active=read.snapshot.blocks.filter(b=>['work','travel'].includes(b.kind)&&b.durationMinutes>0);
      if(active.length>1000)throw new Error('too_many_allocations');
      // Sequential bounded reads avoid loading an unbounded historical catalog.
      const results:ResolvedAllocation[]=[]; const cache=new Map<string,any>();
      for(const block of active){
        const t=block.target;if(!t)throw new Error('frozen_target_missing');
        const key=JSON.stringify(t);let binding=cache.get(key);
        if(!binding){const rows=await request('operations_personnel_target_bindings',{select:'source_project_id,source_booking_id,currency',
          organization_id:'eq.'+org,source_system:'eq.'+t.sourceSystem,target_kind:'eq.'+t.kind,external_id:'eq.'+t.externalId,target_version:'eq.'+t.version,limit:'2'});
          if(rows.length!==1)throw new Error('frozen_target_binding_missing');binding=rows[0];cache.set(key,binding);}
        results.push({organization_id:org,source_time_line_id:block.id,target:t,...binding});
      }return results;
    },
    async rates(org:string,worker:string,date:string):Promise<HistoricalPersonnelRate[]>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('invalid_work_date');
      const rows=await request('operations_personnel_accepted_rate_history_v1',{select:'organization_id,worker_id,category,currency,rate_revision,hourly_rate_minor,effective_from,effective_to',
        organization_id:'eq.'+org,worker_id:'eq.'+worker,effective_from:'lte.'+date,or:'(effective_to.is.null,effective_to.gt.'+date+')',limit:'1001'});
      if(rows.length>1000)throw new Error('too_many_rate_histories');return rows;
    },
    issuedAncestor(org:string,stream:string,revision:number,issuer:string,epoch:string):Promise<boolean>{
      return rpc('get_operations_personnel_issued_ancestor_v1',{p_org:org,p_stream:stream,p_revision:revision,p_issuer:issuer,p_epoch:epoch});
    },
    publish(snapshot:PersonnelCostSnapshot,raw:TimePersonnelRead['snapshot'],evidence:PersonnelSourceEvidence,expected:number,key:string){
      return rpc('publish_operations_personnel_cost_ingress_v1',{p_snapshot:snapshot,p_raw_time_snapshot:raw,p_source_evidence:evidence,p_expected_revision:expected,p_idempotency_key:key});
    },
    claim(owner:string,limit:number):Promise<PersonnelOutboxClaim[]>{return rpc('claim_operations_personnel_cost_outbox_v1',{p_owner:owner,p_limit:limit,p_lease_seconds:30});},
    finish(claim:PersonnelOutboxClaim,result:PersonnelDispatchResult){return rpc('finish_operations_personnel_cost_outbox_v1',{
      p_id:claim.id,p_owner:claim.lease_owner,p_lease_token:claim.lease_token,p_outcome:result.outcome,
      p_receipt:'receipt'in result?result.receipt:null,p_error:'error'in result?result.error:null});},
  };
}
