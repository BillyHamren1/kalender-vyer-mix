/** Real signed synthetic JWT -> default fetch -> PostgREST -> actual source-owned SQL. No writes. */
import { readScopeInvoiceCapture, type ScopeInvoiceCaptureReadClient } from '../../src/lib/economy/projectScopeInvoiceCapture.ts';
import { validateScopeInvoiceCaptureAdminEvidence, type ScopeInvoiceCaptureAdminRequest } from '../../supabase/functions/_shared/project-scope-invoice-capture-admin.ts';
import { validateScopeInvoiceKernelEvidence, projectScopeInvoiceKernelEvidence } from '../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org='11111111-1111-4111-8111-111111111111',root='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fail=():never=>{throw new Error('Isolated scope invoice HTTP proof failed');};
function requireTrue(v:unknown):asserts v{if(!v)fail();}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
let passed=0;
function pass(name:string){console.log('operations-scope-compatible-read-http PASS '+name);passed++;}
function origin(raw:string|undefined):string{
 requireTrue(typeof raw==='string');const url=new URL(raw);
 requireTrue(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.port==='55407'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/');return url.origin;
}
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function jwt(secret:string,sub:string|null,role='authenticated'){
 const now=Math.floor(Date.now()/1000);const head=b64(new TextEncoder().encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
 const claims=b64(new TextEncoder().encode(JSON.stringify({role,...(sub?{sub}:{}),iat:now,exp:now+600})));
 const body=head+'.'+claims,key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return body+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))));
}
/** TEST namespace transport bound; default fetch is used by the genuine HTTP journey. */
export async function request(base:string,raw:unknown,token:string|null,signal?:AbortSignal,route:'read_operations_scope_invoice_capture_admin_v1'|'read_operations_scope_invoice_kernel_evidence_v1'|'operations_scope_compatible_read_http_state_v1'='read_operations_scope_invoice_capture_admin_v1',profile?:'operations_economy_private',runtime:{fetcher?:typeof fetch;timeoutMs?:number}={}){
 const limit=runtime.timeoutMs??15000;requireTrue(Number.isSafeInteger(limit)&&limit>0&&limit<=15000);
 const controller=new AbortController(),started=performance.now();let stopped=false,finished=false,response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 let rejectBudget:(error:Error)=>void=()=>{};
 const budget=new Promise<never>((_resolve,reject)=>{rejectBudget=reject;});
 const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});};
 const stop=()=>{if(finished)return;stopped=true;controller.abort();cancel();rejectBudget(new Error('Isolated HTTP request deadline or abort'));};
 const active=()=>{if(stopped||controller.signal.aborted||performance.now()-started>=limit){stopped=true;cancel();fail();}};
 const timer=setTimeout(stop,limit);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 const work=async()=>{
  active();response=await (runtime.fetcher??fetch)(base+'/rpc/'+route,{method:'POST',redirect:'error',headers:{'content-type':'application/json',...(profile?{'Content-Profile':profile}:{}),...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(route==='operations_scope_compatible_read_http_state_v1'?{}:{p_request:raw}),signal:controller.signal});
  // A late fetch which ignores abort must be cancelled before assigning a reader.
  active();requireTrue(response.body);reader=response.body.getReader();
  let bytes=0,chunks=0;const parts:Uint8Array[]=[];
  while(true){active();const part=await reader.read();active();if(part.done)break;requireTrue(++chunks<=4096);if(!part.value.byteLength)continue;bytes+=part.value.byteLength;requireTrue(bytes<=262144);parts.push(part.value);}
  const value=new Uint8Array(bytes);let at=0;for(const part of parts){value.set(part,at);at+=part.byteLength;}
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(value);active();const data=JSON.parse(decoded);active();return {status:response.status,data};
 };
 try{return await Promise.race([work(),budget]);}
 catch(error){stopped=true;cancel();throw error;}
 finally{finished=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);if(reader)try{reader.releaseLock();}catch{/* Pending ignored-abort read is cancelled without awaiting it. */}}
}
function client(base:string,token:string){
 const state={actor,token,sessionCalls:0,rpcCalls:0,sent:null as unknown,header:''};
 const result:ScopeInvoiceCaptureReadClient={auth:{getSession:async()=>{state.sessionCalls++;return {data:{session:{access_token:state.token,user:{id:state.actor}}},error:null};}},
 rpc:(name,args)=>{requireTrue(name==='read_operations_scope_invoice_capture_admin_v1');state.sent=args;return {setHeader:(name,value)=>{requireTrue(name==='Authorization');state.header=value;return {abortSignal:async signal=>{state.rpcCalls++;const response=await request(base,args.p_request,value.startsWith('Bearer ')?value.slice(7):null,signal);return response.status===200?{data:response.data,error:null}:{data:null,error:response.data};}};}};}};
 return {state,client:result};
}
async function deny(base:string,raw:unknown,token:string|null,status:number|number[],code?:string){
 const response=await request(base,raw,token);requireTrue((Array.isArray(status)?status:[status]).includes(response.status));
 if(code)requireTrue(response.data&&typeof response.data==='object'&&(response.data as {code?:unknown}).code===code);
}
async function fixtureState(base:string,token:string){
 const response=await request(base,null,token,undefined,'operations_scope_compatible_read_http_state_v1');
 requireTrue(response.status===200&&response.data&&typeof response.data==='object'&&!Array.isArray(response.data));
 const value=response.data as Record<string,unknown>,keys=['schema','database','state_sha256','old_service_core_role_execute','old_admin_core_role_execute','baselines','invoice_heads','credit_heads'];
 requireTrue(Object.keys(value).length===8&&keys.every(k=>Object.hasOwn(value,k))&&value.schema==='operations-scope-compatible-read-http-state.v1'&&value.database==='eventflow_scope_publication_runtime'&&typeof value.state_sha256==='string'&&/^[a-f0-9]{64}$/.test(value.state_sha256)&&value.invoice_heads===2&&value.credit_heads===0&&value.baselines===4&&value.old_service_core_role_execute===false&&value.old_admin_core_role_execute===false);
 return value.state_sha256;
}
async function run(){
 // Refuse before network/key use. The root runner owns a fresh dedicated DB and source pins.
 requireTrue(Deno.env.get('CI')==='true'&&Deno.env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_ISOLATED')==='true');
 requireTrue(Deno.env.get('PGDATABASE')==='eventflow_scope_publication_runtime');
 requireTrue(Deno.env.get('PGHOSTADDR')===undefined&&Deno.env.get('PGSERVICE')===undefined&&Deno.env.get('PGSERVICEFILE')===undefined);
 const base=origin(Deno.env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_BASE_URL'));
 const secret=Deno.env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_JWT_SECRET');requireTrue(typeof secret==='string'&&new TextEncoder().encode(secret).length>=32);
 const composition=Deno.env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_COMPOSITION_SNAPSHOT_ID');requireTrue(uuid(composition));
 const raw:ScopeInvoiceCaptureAdminRequest={schema_version:'operations-scope-invoice-capture-admin-read.v1',root_kind:'large_project',root_id:root,expected_composition_snapshot_id:composition};
 const signed=await jwt(secret,actor),before=await fixtureState(base,signed),c=client(base,signed),authority={actorId:actor,organizationId:org,accessToken:signed,request:raw};
 const copied=await readScopeInvoiceCapture(c.client,authority,new AbortController().signal);
 const projection=await projectScopeInvoiceKernelEvidence(copied.evidence);
 requireTrue(projection.known_captured_invoice_cost_minor===541000&&projection.preliminary_captured_invoice_cost_minor===541000&&projection.confirmed_captured_invoice_cost_minor===0&&projection.resolved_source_count===3&&projection.member_count===3&&new Set(copied.evidence.source_inventory.map(s=>s.invoice_id)).size===2&&copied.evidence.members.some(m=>m.kernel_evidence.state==='unsupported_basis'));
 requireTrue(projection.eac_minor===null&&projection.remaining_minor===null&&projection.budget_minor===null&&projection.margin_minor===null&&projection.credit_eligible===false&&projection.source_coverage==='unavailable'&&Object.values(projection.category_coverage).every(v=>v==='unavailable'));
 pass('real_default_fetch_loader_parser_frozen_projection_541000_partial');
 requireTrue(c.state.rpcCalls===1&&c.state.sessionCalls===2&&c.state.header==='Bearer '+signed&&JSON.stringify(c.state.sent)===JSON.stringify({p_request:raw}));pass('exact_source_free_request_and_captured_session');
 await deny(base,{...raw,organization_id:org},signed,400,'22023');pass('caller_organization_rejected');
 await deny(base,{...raw,source_organization_id:org},signed,400,'22023');pass('caller_source_selector_rejected');
 await deny(base,{...raw,root_id:[root]},signed,400,'22023');pass('nonstring_identity_rejected');
 await deny(base,{...raw,root_kind:'project',root_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},signed,403,'42501');pass('foreign_actual_project_denied');
 const stale={...raw,expected_composition_snapshot_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
 await deny(base,stale,signed,409,'PT409');const staleClient=client(base,signed);let rejected=false;try{await readScopeInvoiceCapture(staleClient.client,{...authority,request:stale},new AbortController().signal);}catch(error){rejected=error instanceof Error&&error.message.includes('har ändrats');}requireTrue(rejected);pass('displayed_token_conflict_and_actual_loader_discard');
 await deny(base,raw,await jwt(secret,null),403,'42501');pass('signed_missing_actor_denied');
 await deny(base,raw,null,[401,403],'42501');pass('anonymous_denied');
 await deny(base,raw,await jwt(secret,actor,'service_role'),403,'42501');pass('service_role_app_boundary_denied');
 await deny(base,raw,await jwt(secret+'wrong',actor),401);pass('genuine_wrong_signature_denied');
 // Real RPC succeeds under the same signed JWT; a changed local view actor must discard it.
 const changed=client(base,signed);const session=changed.client.auth.getSession;
 changed.client.auth.getSession=async()=>{if(changed.state.sessionCalls===1)changed.state.actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';return session();};
 rejected=false;try{await readScopeInvoiceCapture(changed.client,authority,new AbortController().signal);}catch(error){rejected=error instanceof Error&&error.message.includes('Sessionen');}
 requireTrue(rejected&&changed.state.rpcCalls===1);pass('same_jwt_changed_view_actor_discards_actual_reply');
 const again=await request(base,raw,signed);requireTrue(again.status===200);await validateScopeInvoiceCaptureAdminEvidence(again.data,org,raw);pass('final_current_capture_unchanged');
 requireTrue(await fixtureState(base,signed)===before);pass('actual_dedicated_db_and_full_seed_state_fingerprint_unchanged');
 const serviceRaw=JSON.parse(Deno.env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_SERVICE_REQUEST')??'null');requireTrue(serviceRaw&&serviceRaw.schema_version==='operations-scope-invoice-kernel-read.v1'&&serviceRaw.organization_id===org&&Object.keys(serviceRaw).length===7);
 const serviceToken=await jwt(secret,actor,'service_role');
 const service=await request(base,serviceRaw,serviceToken,undefined,'read_operations_scope_invoice_kernel_evidence_v1');requireTrue(service.status===200);const serviceEvidence=await validateScopeInvoiceKernelEvidence(service.data);const serviceProjection=await projectScopeInvoiceKernelEvidence(serviceEvidence);const {as_of:serviceClock,...serviceStable}=serviceProjection,{as_of:adminClock,...adminStable}=projection;requireTrue(typeof serviceClock==='string'&&typeof adminClock==='string'&&JSON.stringify(serviceStable)===JSON.stringify(adminStable));pass('actual_signed_service_same_copied_projection');
 const authService=await request(base,serviceRaw,signed,undefined,'read_operations_scope_invoice_kernel_evidence_v1');requireTrue(authService.status===403&&(authService.data as {code?:unknown})?.code==='42501');pass('authenticated_service_entry_denied');
 const malformedService=await request(base,{...serviceRaw,expected_scope_revision:String(serviceRaw.expected_scope_revision)},serviceToken,undefined,'read_operations_scope_invoice_kernel_evidence_v1');requireTrue(malformedService.status===400&&(malformedService.data as {code?:unknown})?.code==='22023');pass('service_strict_numeric_revision_denied');
 const privateProfile=await request(base,serviceRaw,serviceToken,undefined,'read_operations_scope_invoice_kernel_evidence_v1','operations_economy_private');requireTrue(privateProfile.status===406&&(privateProfile.data as {code?:unknown})?.code==='PGRST106');pass('private_schema_not_exposed_and_core_role_acl_denied');
 await deny(base,raw,await jwt(secret,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),403,'42501');pass('actual_leaf_actor_no_whole_scope_escalation');
 await deny(base,raw,await jwt(secret,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),403,'42501');pass('actual_foreign_admin_no_scope_disclosure');
 requireTrue(await fixtureState(base,signed)===before);requireTrue(passed===20);console.log('operations-scope-compatible-read-http PASS TOTAL 20');
}
if(import.meta.main)await run();
