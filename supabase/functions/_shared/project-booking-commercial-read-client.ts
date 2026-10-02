import {validateBookingCommercialReadRequest,validateBookingCommercialReadResponse,type BookingCommercialReadRequest,type BookingCommercialReadResponse} from './project-booking-commercial-read.ts';
export const BOOKING_COMMERCIAL_READ_ROUTE='finance-booking-commercial-evidence-read';
export interface BookingCommercialReadSource {enabled:boolean;endpoint_url:string;key_id:string;secret:string;operations_organization_id:string;finance_organization_id:string;booking_source_organization_id:string;}
export type BookingCommercialReadFailure='disabled'|'invalid_authority'|'timeout'|'source_authentication_failed'|'source_forbidden'|'source_unavailable'|'invalid_source_response';
export class BookingCommercialReadError extends Error {constructor(public readonly code:BookingCommercialReadFailure){super(code);this.name='BookingCommercialReadError';}}
export function bookingCommercialReadSigningMessage(keyId:string,timestamp:string,nonce:string,rawBody:string):string{return ['POST',BOOKING_COMMERCIAL_READ_ROUTE,'operations-booking-commercial-read.v1',keyId,timestamp,nonce,rawBody].join('\n');}
export async function signBookingCommercialRead(keyId:string,secret:string,timestamp:string,nonce:string,rawBody:string):Promise<string>{
 if(![keyId,secret,timestamp,nonce,rawBody].every(value=>typeof value==='string')||!/^[A-Za-z0-9_-]{4,64}$/.test(keyId)||new TextEncoder().encode(secret).byteLength<32||!/^[1-9]\d*$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||!/^[A-Za-z0-9_-]{16,128}$/.test(nonce))throw new BookingCommercialReadError('invalid_authority');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(bookingCommercialReadSigningMessage(keyId,timestamp,nonce,rawBody)));return 'v1='+[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function newNonce():string{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function trustedEndpoint(source:BookingCommercialReadSource,request:BookingCommercialReadRequest):URL{
 if(!source||source.enabled!==true)throw new BookingCommercialReadError('disabled');
 if(!['operations_organization_id','finance_organization_id','booking_source_organization_id'].every(key=>typeof source[key as keyof BookingCommercialReadSource]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source[key as keyof BookingCommercialReadSource] as string))||typeof source.key_id!=='string'||typeof source.secret!=='string')throw new BookingCommercialReadError('invalid_authority');
 let url:URL;try{url=new URL(source.endpoint_url);}catch{throw new BookingCommercialReadError('invalid_authority');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!==`/functions/v1/${BOOKING_COMMERCIAL_READ_ROUTE}`||source.endpoint_url!==url.href||source.operations_organization_id.toLowerCase()!==request.operations_organization_id||source.finance_organization_id.toLowerCase()!==request.finance_organization_id||source.booking_source_organization_id.toLowerCase()!==request.booking_source_organization_id)throw new BookingCommercialReadError('invalid_authority');return url;
}

/** Uses only a server-enrolled exact HTTPS endpoint and purpose-scoped key.
 * Caller must additionally resolve live scope/member/read authority; valid labels
 * do not authorize a tenant. No Finance service key is accepted or shared. */
export async function readBookingCommercialEvidence(requestValue:BookingCommercialReadRequest,source:BookingCommercialReadSource,options:{fetchImpl?:typeof fetch;timeoutMs?:number}={}):Promise<BookingCommercialReadResponse>{
 const request=validateBookingCommercialReadRequest(requestValue),url=trustedEndpoint(source,request),rawBody=JSON.stringify(request);
 if(new TextEncoder().encode(rawBody).byteLength>4096)throw new BookingCommercialReadError('invalid_authority');
 const timeoutMs=options.timeoutMs??10000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw new BookingCommercialReadError('invalid_authority');
 const timestamp=String(Math.floor(Date.now()/1000)),nonce=newNonce(),signature=await signBookingCommercialRead(source.key_id,source.secret,timestamp,nonce,rawBody),controller=new AbortController();let timedOut=false;
 let timer:ReturnType<typeof setTimeout>|undefined;let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();void reader?.cancel().catch(()=>{});reject(new BookingCommercialReadError('timeout'));},timeoutMs);});
 try{
  const result=await Promise.race([(async()=>{
   let response:Response;try{response=await (options.fetchImpl??fetch)(url.href,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','x-eventflow-key-id':source.key_id,'x-eventflow-timestamp':timestamp,'x-eventflow-nonce':nonce,'x-eventflow-signature':signature},body:rawBody});}catch{if(timedOut)throw new BookingCommercialReadError('timeout');throw new BookingCommercialReadError('source_unavailable');}
   if(timedOut){void response.body?.cancel().catch(()=>{});throw new BookingCommercialReadError('timeout');}
   if(response.status!==200){void response.body?.cancel().catch(()=>{});if(response.status===401)throw new BookingCommercialReadError('source_authentication_failed');if(response.status===403)throw new BookingCommercialReadError('source_forbidden');if(response.status>=500)throw new BookingCommercialReadError('source_unavailable');throw new BookingCommercialReadError('invalid_source_response');}
   if(!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});throw new BookingCommercialReadError('invalid_source_response');}
   const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>256*1024)){void response.body.cancel().catch(()=>{});throw new BookingCommercialReadError('invalid_source_response');}
   reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
   while(true){const part=await reader.read();if(timedOut)throw new BookingCommercialReadError('timeout');if(part.done)break;bytes+=part.value.byteLength;if(bytes>256*1024){void reader.cancel().catch(()=>{});throw new BookingCommercialReadError('invalid_source_response');}chunks.push(part.value);}
   if(timedOut)throw new BookingCommercialReadError('timeout');const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));const validated=await validateBookingCommercialReadResponse(value,request);if(timedOut)throw new BookingCommercialReadError('timeout');return validated;
  })(),timeout]);
  if(timedOut)throw new BookingCommercialReadError('timeout');return result;
 }catch(error){if(timedOut)throw new BookingCommercialReadError('timeout');if(error instanceof BookingCommercialReadError)throw error;throw new BookingCommercialReadError('invalid_source_response');}
 finally{if(timer!==undefined)clearTimeout(timer);void reader?.cancel().catch(()=>{});}
}
