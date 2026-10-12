import {openPersonnelIssuerSession} from '../_shared/project-personnel-source-issuer.ts';
import {dispatchAcceptedPersonnelClaim,type AcceptedPersonnelTransportConfiguration} from '../_shared/project-personnel-accepted-transport.ts';
import { readAuthenticatedTimePersonnel, buildPersonnelPublication } from '../_shared/project-personnel-ingestion.ts';
import { createOperationsPersonnelStore,OperationsPersonnelDatabaseError } from '../_shared/project-personnel-ingestion-store.ts';
import { dispatchPersonnelOutboxClaim,readBoundedBody } from '../_shared/project-personnel-ingestion-transport.ts';
export interface PersonnelPublishConfig {
  enabled: boolean; internalSecret: string; databaseUrl: string; databaseServiceKey: string;
  timeEndpoint: string; timeSigningSeed: string;
  accepted?: {enabled:boolean;issuerId:string;enrollmentEpoch:string;destinationOrganizationId:string;issuerSecret:string;transport:AcceptedPersonnelTransportConfiguration};
  finance: {enabled:boolean;endpoint:string;keyId:string;secret:string}; fetchImpl?:typeof fetch;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const sameSecret=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let difference=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)difference|=(x[i]??0)^(y[i]??0);return difference===0;};
export function createPersonnelPublishHandler(config:PersonnelPublishConfig):(request:Request)=>Promise<Response>{
  return async request=>{
    if(!config.enabled)return json(503,{error:'personnel_publisher_disabled'});
    if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
    if(new TextEncoder().encode(config.internalSecret).length<32 || !sameSecret(request.headers.get('authorization')??'','Bearer '+config.internalSecret))
      return json(401,{error:'unauthorized'});
    let input:Record<string,unknown>;
    try{const bytes=await readBoundedBody(request.body,4096,15000);
      input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();
    }catch(error){return json(error instanceof Error&&error.message==='body_too_large'?413:400,{error:'invalid_request'});}
    try{
      const acceptedConfig=config.accepted;
      if(acceptedConfig?.enabled||acceptedConfig?.transport.enabled){
        if(!acceptedConfig.enabled||![acceptedConfig.issuerId,acceptedConfig.enrollmentEpoch,acceptedConfig.destinationOrganizationId].every(uuid)
          ||new TextEncoder().encode(acceptedConfig.issuerSecret).length<32
          ||[config.databaseServiceKey,config.internalSecret,config.timeSigningSeed,config.finance.secret,acceptedConfig.transport.secret].filter(Boolean).includes(acceptedConfig.issuerSecret))return json(503,{error:'accepted_issuer_configuration_invalid'});
        if(acceptedConfig.transport.enabled&&(new TextEncoder().encode(acceptedConfig.transport.secret).length<32
          ||[config.databaseServiceKey,config.internalSecret,config.timeSigningSeed,config.finance.secret,acceptedConfig.issuerSecret].includes(acceptedConfig.transport.secret)))return json(503,{error:'accepted_dispatch_configuration_invalid'});
      }
      const fetchImpl=config.fetchImpl??fetch;
      const store=createOperationsPersonnelStore(config.databaseUrl,config.databaseServiceKey,fetchImpl);
      if(input.operation==='dispatch'){
        if(Object.keys(input).length!==2||!Number.isSafeInteger(input.limit)||Number(input.limit)<1||Number(input.limit)>20)return json(400,{error:'invalid_dispatch_request'});
        if(config.accepted?.transport.enabled){
          const accepted=config.accepted,transport=accepted.transport;
          if(!accepted.enabled||config.finance.enabled||transport.issuerId!==accepted.issuerId||transport.enrollmentEpoch!==accepted.enrollmentEpoch
            ||![accepted.issuerId,accepted.enrollmentEpoch,accepted.destinationOrganizationId].every(uuid)
            ||new TextEncoder().encode(accepted.issuerSecret).length<32||new TextEncoder().encode(transport.secret).length<32
            ||[config.internalSecret,config.timeSigningSeed,accepted.issuerSecret].includes(transport.secret))return json(503,{error:'accepted_dispatch_configuration_invalid'});
          const endpoint=new URL(transport.endpoint);
          if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/functions/v1/operations-personnel-accepted-receive')return json(503,{error:'accepted_dispatch_configuration_invalid'});
          const owner=crypto.randomUUID(),outcomes=[],started=Date.now();
          for(let i=0;i<Number(input.limit);i++){if(i>0&&Date.now()-started>20000)break;
            const claims=await store.claimAccepted(accepted.issuerId,accepted.enrollmentEpoch,owner);if(!claims.length)break;
            const claim=claims[0],result=await dispatchAcceptedPersonnelClaim(claim,transport,fetchImpl);
            outcomes.push({outbox_id:claim.id,...await store.finishAccepted(claim,result)});
          }
          return json(200,{schema:'operations-personnel-accepted-dispatch-receipt.v1',financially_applied:false,outcomes});
        }
        if(config.accepted?.enabled)return json(503,{error:'accepted_transport_disabled'});
        if(!config.finance.enabled)return json(503,{error:'finance_transport_disabled'});
        const owner=crypto.randomUUID(),outcomes=[],started=Date.now();
        // Claim immediately before each attempt. A queued batch cannot expire while
        // a preceding network timeout consumes another row's lease budget.
        for(let i=0;i<Number(input.limit);i++){if(i>0&&Date.now()-started>20000)break;const claims=await store.claim(owner,1);if(!claims.length)break;
          const claim=claims[0],result=await dispatchPersonnelOutboxClaim(claim,config.finance,fetchImpl);
          outcomes.push({outbox_id:claim.id,...await store.finish(claim,result)});}
        return json(200,{schema:'operations-personnel-dispatch-receipt-v1',outcomes});
      }
      if(input.operation!=='ingest'||Object.keys(input).length!==4||!uuid(input.organization_id)||!uuid(input.worker_id)||!uuid(input.submission_id))
        return json(400,{error:'invalid_ingestion_request'});
      const mode=await store.mode(input.organization_id,input.worker_id);
      if(mode.mode==='blocked')return json(503,{error:'accepted_worker_setup_required'});
      if(mode.mode==='accepted'){
        const accepted=config.accepted;
        if(!accepted?.enabled||accepted.issuerId!==mode.issuer_id||accepted.enrollmentEpoch!==mode.enrollment_epoch||accepted.destinationOrganizationId!==mode.destination_organization_id
          ||[config.internalSecret,config.timeSigningSeed,accepted.transport.secret].includes(accepted.issuerSecret))return json(503,{error:'accepted_issuer_configuration_invalid'});
        const session=await openPersonnelIssuerSession({...accepted,databaseUrl:config.databaseUrl,databaseServiceKey:config.databaseServiceKey,timeEndpoint:config.timeEndpoint,timeSigningSeed:config.timeSigningSeed},
          {organizationId:input.organization_id,workerId:input.worker_id,submissionId:input.submission_id},fetchImpl);
        const streamMode=await store.mode(input.organization_id,input.worker_id,session.stream);
        if(streamMode.mode!=='accepted'||streamMode.issuer_id!==accepted.issuerId||streamMode.enrollment_epoch!==accepted.enrollmentEpoch||streamMode.destination_organization_id!==accepted.destinationOrganizationId)return json(503,{error:'accepted_stream_setup_required'});
        for(let attempt=0;attempt<3;attempt++){
          const prepared=await session.prepare();
          if(!prepared.command)return json(200,{schema:'operations-personnel-issued-receipt.v1',status:'unchanged',source_revision:prepared.currentRevision});
          try{return json(200,await store.issue(prepared.command));}
          catch(error){if(error instanceof OperationsPersonnelDatabaseError&&error.sqlstate==='40001')continue;throw error;}
        }
        return json(409,{error:'publication_head_changed'});
      }
      if(mode.mode!=='legacy')throw new Error('ambiguous_personnel_mode');
      const binding=await store.binding(input.organization_id,input.worker_id);
      const read=await readAuthenticatedTimePersonnel(binding,input.submission_id,{endpoint:config.timeEndpoint,signingSeed:config.timeSigningSeed},fetchImpl);
      const stream=`time:${binding.time_organization_id}:${binding.time_personnel_id}:${read.snapshot.workDate}`;
      // CAS races re-read the committed Operations head. The Time evidence stays frozen.
      for(let attempt=0;attempt<3;attempt++){
        const current=await store.current(binding.organization_id,stream);
        const sameVersion=current.cost_snapshot?.time_snapshot_version===read.snapshot.version;
        const [allocations,rates]=sameVersion?[[],[]]:await Promise.all([store.allocations(binding.organization_id,read),store.rates(binding.organization_id,binding.worker_id,read.snapshot.workDate)]);
        const publication=await buildPersonnelPublication({read,binding,current,allocations,rates});
        if(!publication)return json(200,{schema:'operations-personnel-publication-receipt-v1',status:'unchanged',source_revision:current.current_revision});
        const receipt=await store.publish(publication.snapshot,read.snapshot,publication.sourceEvidence,current.current_revision,publication.idempotencyKey);
        if(receipt.status==='stale')continue;
        if(['stale_time_snapshot','stale_source_review'].includes(receipt.status))return json(409,receipt);
        return json(200,{schema:'operations-personnel-publication-receipt-v1',...receipt});
      }
      return json(409,{error:'publication_head_changed'});
    }catch{return json(503,{error:'personnel_publication_unavailable'});}
  };
}
