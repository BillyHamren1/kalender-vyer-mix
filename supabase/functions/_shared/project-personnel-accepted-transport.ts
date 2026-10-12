/** Dormant accepted-evidence transport. No financial application or caller is enabled. */
import {rawBodySha256,readBoundedBody} from './project-personnel-ingestion-transport.ts';
export const ACCEPTED_PERSONNEL_ROUTE='operations-personnel-accepted-receive';
export interface AcceptedPersonnelClaim {
 id:string;organization_id:string;source_time_stream_id:string;source_revision:number;raw_body:string;body_sha256:string;
 destination_organization_id:string;issuer_id:string;enrollment_epoch:string;endpoint_url:string;lease_owner:string;lease_token:string;
}
export interface AcceptedPersonnelTransportConfiguration {enabled:boolean;endpoint:string;issuerId:string;enrollmentEpoch:string;secret:string;timeoutMs?:number}
export interface AcceptedPersonnelAcknowledgement {raw_ack:string;signature:string}
export type AcceptedPersonnelDispatchResult={outcome:'delivered';receipt:AcceptedPersonnelAcknowledgement}|{outcome:'retry'|'blocked';error:string};
const encoder=new TextEncoder();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),b=>b.toString(16).padStart(2,'0')).join('');
function endpoint(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/functions/v1/'+ACCEPTED_PERSONNEL_ROUTE)throw new Error('untrusted_accepted_endpoint');return u.href;}
async function key(secret:string){if(encoder.encode(secret).length<32)throw new Error('invalid_accepted_key');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function verifyAcceptedPersonnelAcknowledgement(value:unknown,claim:AcceptedPersonnelClaim,secret:string):Promise<AcceptedPersonnelAcknowledgement>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_accepted_ack');
 const r=value as AcceptedPersonnelAcknowledgement;
 if(Object.keys(r).length!==2||typeof r.raw_ack!=='string'||encoder.encode(r.raw_ack).length>16384||typeof r.signature!=='string'||!/^[0-9a-f]{64}$/.test(r.signature))throw new Error('invalid_accepted_ack');
 const bytes=Uint8Array.from(r.signature.match(/../g)!,b=>parseInt(b,16));
 if(!await crypto.subtle.verify('HMAC',await key(secret),bytes,encoder.encode('operations-personnel-accepted-ack.v1\n'+r.raw_ack)))throw new Error('invalid_accepted_ack_signature');
 const a=JSON.parse(r.raw_ack),keys=['schema','outcome','issuer_id','enrollment_epoch','source_organization_id','destination_organization_id','source_stream_id','source_revision','outbox_id','envelope_sha256','receipt_id','financially_applied'];
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==keys.length||Object.keys(a).some(k=>!keys.includes(k))
  ||a.schema!=='operations-personnel-accepted-receipt.v1'||!['received','replayed'].includes(a.outcome)||a.financially_applied!==false
  ||a.issuer_id!==claim.issuer_id||a.enrollment_epoch!==claim.enrollment_epoch||a.source_organization_id!==claim.organization_id
  ||a.destination_organization_id!==claim.destination_organization_id||a.source_stream_id!==claim.source_time_stream_id||!Number.isSafeInteger(a.source_revision)
  ||a.source_revision!==claim.source_revision||a.outbox_id!==claim.id||a.envelope_sha256!==claim.body_sha256||!uuid(a.receipt_id))throw new Error('unbound_accepted_ack');
 return r;
}
export async function dispatchAcceptedPersonnelClaim(claim:AcceptedPersonnelClaim,config:AcceptedPersonnelTransportConfiguration,fetchImpl:typeof fetch=fetch):Promise<AcceptedPersonnelDispatchResult>{
 if(!config.enabled)return{outcome:'blocked',error:'accepted_transport_disabled'};
 try{
  const target=endpoint(config.endpoint);
  if(target!==endpoint(claim.endpoint_url)||config.issuerId!==claim.issuer_id||config.enrollmentEpoch!==claim.enrollment_epoch
   ||![claim.id,claim.organization_id,claim.destination_organization_id,claim.issuer_id,claim.enrollment_epoch,claim.lease_token].every(uuid)
   ||!Number.isSafeInteger(claim.source_revision)||claim.source_revision<1||encoder.encode(claim.raw_body).length>524288
   ||await rawBodySha256(claim.raw_body)!==claim.body_sha256)return{outcome:'blocked',error:'accepted_claim_mismatch'};
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID();
  const signed=['operations-personnel-accepted-delivery.v1',ACCEPTED_PERSONNEL_ROUTE,timestamp,nonce,claim.issuer_id,claim.enrollment_epoch,claim.raw_body].join('\n');
  const signature=hex(await crypto.subtle.sign('HMAC',await key(config.secret),encoder.encode(signed)));
  const response=await fetchImpl(target,{method:'POST',body:claim.raw_body,headers:{'content-type':'application/json','x-eventflow-issuer-id':claim.issuer_id,
   'x-eventflow-enrollment-epoch':claim.enrollment_epoch,'x-eventflow-timestamp':timestamp,'x-eventflow-nonce':nonce,'x-eventflow-signature':signature},redirect:'error',signal:AbortSignal.timeout(config.timeoutMs??10000)});
  if(response.status!==200){void response.body?.cancel().catch(()=>{});return{outcome:[400,401,403,409,422].includes(response.status)?'blocked':'retry',error:'accepted_http_'+response.status};}
  const body=await readBoundedBody(response.body,32768,config.timeoutMs??10000);
  const receipt=await verifyAcceptedPersonnelAcknowledgement(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)),claim,config.secret);
  return{outcome:'delivered',receipt};
 }catch{return{outcome:'retry',error:'accepted_ack_unknown'};}
}
