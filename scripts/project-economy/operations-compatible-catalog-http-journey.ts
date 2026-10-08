/** Disposable restricted-connection HTTP proof. No writes or provider certificate. */
import { validateScopeInvoiceCaptureAdminEvidence, validateScopeInvoiceCaptureAdminRequest } from '../../supabase/functions/_shared/project-scope-invoice-capture-admin.ts';
import { validateScopeInvoiceKernelEvidence, projectScopeInvoiceKernelEvidence } from '../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';
export const ROUTES = [
 'read_operations_scope_invoice_kernel_evidence_v1','read_operations_scope_invoice_capture_admin_v1',
 'read_operations_scope_obligation_evidence_v1','read_operations_scope_obligation_drilldown_v1',
 'read_operations_scope_obligation_composition_v1','read_operations_invoice_obligation_kernel_evidence_v1',
 'read_operations_obligation_original_v1','read_operations_obligation_source_policy_v1',
] as const;
type Route = typeof ROUTES[number];
const fail = (): never => { throw new Error('closed_catalog_http_failure'); };
const requireTrue = (v: unknown): void => { if (!v) fail(); };
const org='11111111-1111-4111-8111-111111111111', actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project='55555555-5555-4555-8555-555555555555', obligation='10101010-1010-4010-8010-101010101010';
export async function request(base:string,route:Route,args:unknown,token:string|null,profile?:'operations_economy_private',runtime:{fetcher?:typeof fetch;timeoutMs?:number}={}) {
 const limit=runtime.timeoutMs??15000;requireTrue(Number.isSafeInteger(limit)&&limit>0&&limit<=15000&&ROUTES.includes(route));
 const start=performance.now(),controller=new AbortController();let stopped=false,finished=false,response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 let rejectBudget:()=>void=()=>{};
 const budget=new Promise<never>((_resolve,reject)=>{rejectBudget=()=>reject(new Error('closed_catalog_http_budget'));});
 const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});};
 const stop=()=>{if(finished)return;stopped=true;controller.abort();cancel();rejectBudget();};
 const active=()=>{if(stopped||controller.signal.aborted||performance.now()-start>=limit){stopped=true;cancel();fail();}};
 const timer=setTimeout(stop,limit);
 const work=async()=>{
  active();response=await(runtime.fetcher??fetch)(base+'/rpc/'+route,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(profile?{'Content-Profile':profile}:{})},body:JSON.stringify(args),signal:controller.signal});
  active();requireTrue(response.body&&/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''));
  const length=response.headers.get('content-length');if(length!==null)requireTrue(/^(?:0|[1-9][0-9]*)$/.test(length)&&Number(length)<=262144);
  reader=response.body!.getReader();let bytes=0,chunks=0;const parts:Uint8Array[]=[];
  while(true){active();const chunk=await reader.read();active();if(chunk.done)break;requireTrue(++chunks<=4096);if(chunk.value.byteLength===0)continue;bytes+=chunk.value.byteLength;requireTrue(bytes<=262144);parts.push(chunk.value);}
  const buffer=new Uint8Array(bytes);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.byteLength;}
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(buffer);active();const data=JSON.parse(decoded);active();return {status:response.status,data};
 };
 try{return await Promise.race([work(),budget]);}catch(error){stopped=true;controller.abort();cancel();throw error;}
 finally{finished=true;clearTimeout(timer);if(reader)try{reader.releaseLock();}catch{/* Non-awaited cancellation owns ignored reads. */}}
}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function jwt(secret:string,sub:string|null,role:string,extra:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000),head=b64(new TextEncoder().encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
 const body=head+'.'+b64(new TextEncoder().encode(JSON.stringify({role,...(sub?{sub}:{}),iat:now,exp:now+600,...extra})));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return body+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))));
}
/** Remove ONLY independently named volatile timestamp paths from these actual ABIs. */
export function stableReply(route:Route,value:unknown):unknown{
 const copy=JSON.parse(JSON.stringify(value));
 function scope(v:Record<string,unknown>){requireTrue(typeof v.as_of==='string'&&Array.isArray(v.members));delete v.as_of;for(const member of v.members as {kernel_evidence:Record<string,unknown>}[]){requireTrue(typeof member.kernel_evidence.as_of==='string');delete member.kernel_evidence.as_of;}}
 if(route===ROUTES[0])scope(copy);
 else if(route===ROUTES[1])scope(copy.evidence);
 else if(route===ROUTES[2]){requireTrue(typeof copy.generatedAt==='string');delete copy.generatedAt;}
 else if(route===ROUTES[3]){requireTrue(typeof copy.asOf==='string');delete copy.asOf;}
 else if(route===ROUTES[5]){requireTrue(typeof copy.as_of==='string');delete copy.as_of;}
 return copy;
}
const canonical=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';
export async function run(){
 requireTrue(Deno.env.get('CI')==='true'&&Deno.env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_ISOLATED_DB')==='true'&&Deno.env.get('PGDATABASE')==='operations_compatible_install_runtime');
 const raw=Deno.env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_BASE_URL'),u=new URL(raw??'');requireTrue(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='55783'&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash);
 const secret=Deno.env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET');requireTrue(typeof secret==='string'&&new TextEncoder().encode(secret!).length>=32);
 const file=Deno.env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_FIXTURE_FILE');requireTrue(typeof file==='string');
 const text=await Deno.readTextFile(file!);requireTrue(new TextEncoder().encode(text).length<=1048576);
 const rows=JSON.parse(text);requireTrue(Array.isArray(rows)&&rows.length===17&&new Set(rows.map(r=>r.slot)).size===17&&rows.every(r=>r&&Object.keys(r).length===2&&typeof r.slot==='string'&&Object.hasOwn(r,'document')));
 const v=Object.fromEntries(rows.map((r:{slot:string;document:unknown})=>[r.slot,r.document])) as Record<string,Record<string,any>>;
 const admin=await jwt(secret!,actor,'authenticated'),service=await jwt(secret!,null,'service_role');
 const control=Deno.env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_CONTROL');
 if(control!==undefined){
  requireTrue(['gate_disabled','admin_removed','profile_foreign'].includes(control));
  const denied=await request(u.origin,ROUTES[1],{p_request:v.admin_request},admin);requireTrue(denied.status===403&&denied.data.code==='42501');
  if(control==='gate_disabled'){const deniedService=await request(u.origin,ROUTES[0],{p_request:v.service_request},service);requireTrue(deniedService.status===403&&deniedService.data.code==='42501');}
  console.log('operations-compatible-catalog-http PASS control_'+control+'_actual_denial');return;
 }
 const args=[{p_request:v.service_request},{p_request:v.admin_request},{p_organization_id:org,p_root_kind:'large_project',p_root_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
 {p_request:v.drilldown_request},{p_organization_id:org,p_economic_scope_id:'20202020-2020-4020-8020-202020202020'},{p_request:v.kernel_request},
 {p_organization_id:org,p_project_id:project,p_obligation_id:obligation,p_source_anchor:'a'.repeat(64)},
 {p_organization_id:org,p_project_id:project,p_obligation_id:obligation,p_source_anchor:'a'.repeat(64)}];
 const slots=['service_reply','admin_reply','parent_reply','drilldown_reply','composition_reply','kernel_reply','original_reply','policy_reply'];
 const app=new Set([1,2,3]);let positives=0,denials=0;
 for(let i=0;i<8;i++){
  const reply=await request(u.origin,ROUTES[i],args[i],app.has(i)?admin:service);requireTrue(reply.status===200);
  requireTrue(canonical(stableReply(ROUTES[i],reply.data))===canonical(stableReply(ROUTES[i],v[slots[i]])));positives++;
  const wrong=await request(u.origin,ROUTES[i],args[i],app.has(i)?service:admin);requireTrue(wrong.status===403&&wrong.data.code==='42501');denials++;
 }
 const absence=await request(u.origin,ROUTES[2],{p_organization_id:org,p_root_kind:'project',p_root_id:'77777777-7777-4777-8777-777777777777'},admin);
 requireTrue(absence.status===200&&absence.data.state==='no_scope'&&canonical(stableReply(ROUTES[2],absence.data))===canonical(stableReply(ROUTES[2],v.no_scope_reply)));positives++;
 const actual=await request(u.origin,ROUTES[0],args[0],service);requireTrue(actual.status===200);
 const evidence=await validateScopeInvoiceKernelEvidence(actual.data),projection=await projectScopeInvoiceKernelEvidence(evidence);
 requireTrue(projection.known_captured_invoice_cost_minor===null&&projection.confirmed_captured_invoice_cost_minor===null&&projection.preliminary_captured_invoice_cost_minor===null&&projection.remaining_minor===null&&projection.eac_minor===null&&projection.budget_minor===null&&projection.margin_minor===null&&projection.resolved_source_count===0&&evidence.category_coverage.supplier==='unavailable');
 const actualAdmin=await request(u.origin,ROUTES[1],args[1],admin);requireTrue(actualAdmin.status===200);await validateScopeInvoiceCaptureAdminEvidence(actualAdmin.data,org,validateScopeInvoiceCaptureAdminRequest(v.admin_request));
 const denied=async(token:string|null,status:number,body:unknown=args[1],code?:string,profile?:'operations_economy_private')=>{const r=await request(u.origin,ROUTES[1],body,token,profile);requireTrue(r.status===status&&(!code||r.data.code===code));denials++;};
 await denied(null,401,args[1],'42501');
 await denied(await jwt(secret!+'wrong',actor,'authenticated'),401);
 await denied(await jwt(secret!,actor,'authenticated',{exp:Math.floor(Date.now()/1000)-60}),401);
 await denied(await jwt(secret!,null,'authenticated'),403,args[1],'42501');
 await denied(await jwt(secret!,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated'),403,args[1],'42501');
 await denied(await jwt(secret!,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated'),403,args[1],'42501');
 await denied(await jwt(secret!,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','authenticated',{user_metadata:{role:'admin'}}),403,args[1],'42501');
 await denied(admin,400,{p_request:{...v.admin_request,organization_id:org}},'22023');
 await denied(admin,409,{p_request:{...v.admin_request,expected_composition_snapshot_id:'99999999-9999-4999-8999-999999999999'}},'PT409');
 await denied(admin,406,args[1],'PGRST106','operations_economy_private');
 requireTrue(positives===9&&denials===18);
 console.log('operations-compatible-catalog-http PASS exact_eight_public_and_one_absence_copied_null_evidence');
 console.log('operations-compatible-catalog-http PASS denials18_roles_signature_expiry_tenant_metadata_stale_private');
}
if(import.meta.main){try{await run();}catch{console.log('operations-compatible-catalog-http FAIL closed_journey');Deno.exitCode=1;}}
