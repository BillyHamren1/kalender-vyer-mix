/** Default-off server-captured evidence; structural/hash validation is not authorization. */
import {validateLocalInvoiceKernelEvidence,projectLocalInvoiceKernelEvidence,type LocalInvoiceKernelEvidence} from './local-invoice-obligation-kernel-evidence.ts';

type PolicyState='current'|'missing'|'stale';
export interface SavedScopeInvoiceReference {
 source_anchor:string;project_id:string;obligation_id:string;binding_event_id:string;source_snapshot_id:string|null;
 source_economic_revision:number;source_economic_fingerprint:string;source_raw_sha256:string|null;
 binding_state:'bound_original'|'unresolved';policy_state:PolicyState;policy_event_id:string|null;policy_revision:number|null;policy_fingerprint:string|null;
}
export interface ScopeInvoiceInventory {
 source_anchor:string;project_id:string;obligation_id:string;binding_event_id:string;source_organization_id:string;invoice_id:string;source_snapshot_id:string;
 source_economic_revision:number;source_economic_fingerprint:string;source_raw_sha256:string;
 current_snapshot_id:string|null;current_raw_sha256:string|null;policy_state:PolicyState;policy_event_id:string|null;policy_revision:number|null;policy_fingerprint:string|null;
 mapping_state:'charging'|'excluded'|'unsupported_basis';reason:string|null;
}
export interface ScopeInvoiceKernelEvidence {
 schema_version:'operations-scope-invoice-kernel-evidence.v1';organization_id:string;economic_scope_id:string;
 scope_snapshot_id:string;scope_revision:number;membership_fingerprint:string;composition_snapshot_id:string;composition_revision:number;composition_fingerprint:string;
 root_kind:'project'|'large_project'|'packing_project';root_id:string;currency:string;membership_currentness:'as_of_graph';source_currentness:'saved_receiver_heads_only';
 captured_inventory_matches_current:boolean;captured_inventory_fingerprint:string;as_of:string;
 members:{project_id:string;obligation_id:string;captured_baseline_event_id:string;captured_baseline_revision:number;captured_baseline_fingerprint:string;kernel_evidence:LocalInvoiceKernelEvidence}[];
 source_inventory:ScopeInvoiceInventory[];saved_source_references:SavedScopeInvoiceReference[];diagnostics:string[];
 category_coverage:{personnel:'unavailable';supplier:'unavailable';catering:'unavailable';other:'unavailable'};source_coverage:'unavailable';credit_eligible:false;remaining_minor:null;eac_minor:null;budget_minor:null;shadow_only:true;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const equalId=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const equalNullableId=(a:unknown,b:unknown)=>a===null&&b===null||uuid(a)&&uuid(b)&&equalId(a,b);
function timestamp(v:unknown):v is string {
 if(typeof v!=='string')return false;const m=/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(v);
 if(!m||!Number.isFinite(Date.parse(v)))return false;const d=new Date(0);d.setUTCFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));return d.getUTCFullYear()===Number(m[1])&&d.getUTCMonth()===Number(m[2])-1&&d.getUTCDate()===Number(m[3]);
}
const inventoryKeys=['source_anchor','project_id','obligation_id','binding_event_id','source_organization_id','invoice_id','source_snapshot_id','source_economic_revision','source_economic_fingerprint','source_raw_sha256','current_snapshot_id','current_raw_sha256','policy_state','policy_event_id','policy_revision','policy_fingerprint','mapping_state','reason'];
const referenceKeys=['source_anchor','project_id','obligation_id','binding_event_id','source_snapshot_id','source_economic_revision','source_economic_fingerprint','source_raw_sha256','binding_state','policy_state','policy_event_id','policy_revision','policy_fingerprint'];
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
/** Integrity helper only; consumers must validate the full server-captured boundary. */
export async function scopeInvoiceInventoryFingerprint(inventory:ScopeInvoiceInventory[]):Promise<string>{
 const bytes=new TextEncoder().encode('operations-scope-invoice-kernel-inventory-v1\n'+canonical(inventory));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function policy(v:Record<string,unknown>):boolean {
 if(typeof v.policy_state!=='string'||!['current','missing','stale'].includes(v.policy_state))return false;
 if(v.policy_state==='missing')return v.policy_event_id===null&&v.policy_revision===null&&v.policy_fingerprint===null;
 return uuid(v.policy_event_id)&&positive(v.policy_revision)&&hash(v.policy_fingerprint);
}
function comparable(s:ScopeInvoiceInventory):SavedScopeInvoiceReference {
 return {source_anchor:s.source_anchor,project_id:s.project_id.toLowerCase(),obligation_id:s.obligation_id.toLowerCase(),binding_event_id:s.binding_event_id.toLowerCase(),
 source_snapshot_id:s.current_snapshot_id?.toLowerCase()??null,source_economic_revision:s.source_economic_revision,source_economic_fingerprint:s.source_economic_fingerprint,source_raw_sha256:s.current_raw_sha256,
 binding_state:s.mapping_state==='charging'?'bound_original':'unresolved',policy_state:s.policy_state,policy_event_id:s.policy_event_id?.toLowerCase()??null,policy_revision:s.policy_revision,policy_fingerprint:s.policy_fingerprint};
}
export function capturedScopeInvoiceReferencesMatch(saved:SavedScopeInvoiceReference[],current:ScopeInvoiceInventory[]):boolean {
 const normalized=saved.map(s=>({...s,project_id:s.project_id.toLowerCase(),obligation_id:s.obligation_id.toLowerCase(),binding_event_id:s.binding_event_id.toLowerCase(),source_snapshot_id:s.source_snapshot_id?.toLowerCase()??null,policy_event_id:s.policy_event_id?.toLowerCase()??null}));
 return canonical(normalized)===canonical(current.map(comparable));
}
export async function validateScopeInvoiceKernelEvidence(raw:unknown):Promise<ScopeInvoiceKernelEvidence>{
 const keys=['schema_version','organization_id','economic_scope_id','scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint','root_kind','root_id','currency','membership_currentness','source_currentness','captured_inventory_matches_current','captured_inventory_fingerprint','as_of','members','source_inventory','saved_source_references','diagnostics','category_coverage','source_coverage','credit_eligible','remaining_minor','eac_minor','budget_minor','shadow_only'];
 if(!exact(raw,keys)||raw.schema_version!=='operations-scope-invoice-kernel-evidence.v1'||!['organization_id','economic_scope_id','scope_snapshot_id','composition_snapshot_id','root_id'].every(k=>uuid(raw[k]))||!positive(raw.scope_revision)||!positive(raw.composition_revision)||!hash(raw.membership_fingerprint)||!hash(raw.composition_fingerprint)||!hash(raw.captured_inventory_fingerprint)||typeof raw.root_kind!=='string'||!['project','large_project','packing_project'].includes(raw.root_kind)||typeof raw.currency!=='string'||!/^[A-Z]{3}$/.test(raw.currency)||raw.membership_currentness!=='as_of_graph'||raw.source_currentness!=='saved_receiver_heads_only'||typeof raw.captured_inventory_matches_current!=='boolean'||!Array.isArray(raw.members)||raw.members.length>1000||!Array.isArray(raw.source_inventory)||raw.source_inventory.length>10000||!Array.isArray(raw.saved_source_references)||raw.saved_source_references.length>10000||!Array.isArray(raw.diagnostics)||raw.diagnostics.some(v=>typeof v!=='string')||!exact(raw.category_coverage,['personnel','supplier','catering','other'])||Object.values(raw.category_coverage).some(v=>v!=='unavailable')||raw.source_coverage!=='unavailable'||raw.credit_eligible!==false||raw.remaining_minor!==null||raw.eac_minor!==null||raw.budget_minor!==null||raw.shadow_only!==true)throw new Error('invalid_scope_invoice_evidence');
 const members=new Map<string,LocalInvoiceKernelEvidence>();
 for(const m of raw.members){
 if(!exact(m,['project_id','obligation_id','captured_baseline_event_id','captured_baseline_revision','captured_baseline_fingerprint','kernel_evidence'])||!uuid(m.project_id)||!uuid(m.obligation_id)||!uuid(m.captured_baseline_event_id)||!positive(m.captured_baseline_revision)||!hash(m.captured_baseline_fingerprint)||members.has(m.obligation_id.toLowerCase()))throw new Error('duplicate_or_invalid_scope_member');
 const e=validateLocalInvoiceKernelEvidence(m.kernel_evidence);
 if(!equalId(e.organization_id,raw.organization_id as string)||!equalId(e.project_id,m.project_id)||!equalId(e.obligation_id,m.obligation_id)||!equalId(e.baseline.event_id,m.captured_baseline_event_id)||e.baseline.revision!==m.captured_baseline_revision||e.baseline.fingerprint!==m.captured_baseline_fingerprint||e.baseline.currency!==raw.currency)throw new Error('scope_member_proof_mismatch');
 members.set(m.obligation_id.toLowerCase(),e);
 }
 if(!timestamp(raw.as_of))throw new Error('invalid_scope_capture_timestamp');
 const anchors=new Set<string>(),selectors=new Set<string>();let previous='';
 for(const s of raw.source_inventory){
 if(!exact(s,inventoryKeys)||!hash(s.source_anchor)||s.source_anchor<=previous||anchors.has(s.source_anchor)||!['project_id','obligation_id','binding_event_id','source_organization_id','invoice_id','source_snapshot_id'].every(k=>uuid(s[k]))||!positive(s.source_economic_revision)||!hash(s.source_economic_fingerprint)||!hash(s.source_raw_sha256)||!policy(s)||typeof s.mapping_state!=='string'||!['charging','excluded','unsupported_basis'].includes(s.mapping_state))throw new Error('duplicate_or_invalid_permanent_inventory');
 previous=s.source_anchor;anchors.add(s.source_anchor);selectors.add((s.source_organization_id as string).toLowerCase()+':'+(s.invoice_id as string).toLowerCase());
 const member=members.get((s.obligation_id as string).toLowerCase());if(!member||!equalId(member.project_id,s.project_id as string))throw new Error('foreign_inventory_owner');
 if(s.mapping_state==='charging'){if(s.reason!==null||!uuid(s.current_snapshot_id)||!hash(s.current_raw_sha256))throw new Error('invalid_charging_inventory');}
 else if(typeof s.reason!=='string'||!s.reason||s.current_snapshot_id!==null||s.current_raw_sha256!==null||s.policy_state==='current')throw new Error('invalid_excluded_inventory');
 if(s.mapping_state==='unsupported_basis'){if(member.state!=='unsupported_basis')throw new Error('unsupported_inventory_basis_mismatch');continue;}
 const child=member.sources.find(c=>c.source_anchor===s.source_anchor);
 if(!child||child.resolved!==(s.mapping_state==='charging')||child.reason!==s.reason||!equalId(child.binding_event_id,s.binding_event_id as string)||!equalId(child.source_organization_id,s.source_organization_id as string)||!equalId(child.invoice_id,s.invoice_id as string)||!equalId(child.source_snapshot_id,s.source_snapshot_id as string)||child.source_economic_revision!==s.source_economic_revision||child.source_economic_fingerprint!==s.source_economic_fingerprint||child.source_raw_sha256!==s.source_raw_sha256||!equalNullableId(child.current_snapshot_id,s.current_snapshot_id)||child.current_raw_sha256!==s.current_raw_sha256||child.policy_state!==s.policy_state||!equalNullableId(child.policy_event_id,s.policy_event_id)||child.policy_revision!==s.policy_revision||child.policy_fingerprint!==s.policy_fingerprint)throw new Error('inventory_child_proof_mismatch');
 }
 if(selectors.size>100)throw new Error('scope_invoice_global_selector_limit');
 const childAnchors=new Set<string>();
 for(const member of members.values())for(const source of member.sources){
  if(childAnchors.has(source.source_anchor))throw new Error('duplicate_global_child_anchor');childAnchors.add(source.source_anchor);
  const outer=raw.source_inventory.find(s=>s.source_anchor===source.source_anchor);
  if(!outer||!equalId(outer.project_id,member.project_id)||!equalId(outer.obligation_id,member.obligation_id)||outer.mapping_state==='unsupported_basis')throw new Error('child_inventory_owner_mismatch');
 }

 previous='';for(const s of raw.saved_source_references){
 if(!exact(s,referenceKeys)||!hash(s.source_anchor)||s.source_anchor<=previous||!['project_id','obligation_id','binding_event_id'].every(k=>uuid(s[k]))||!(s.source_snapshot_id===null||uuid(s.source_snapshot_id))||!(s.source_raw_sha256===null||hash(s.source_raw_sha256))||!positive(s.source_economic_revision)||!hash(s.source_economic_fingerprint)||typeof s.binding_state!=='string'||!['bound_original','unresolved'].includes(s.binding_state)||!policy(s))throw new Error('invalid_saved_inventory_reference');previous=s.source_anchor;
 const member=members.get((s.obligation_id as string).toLowerCase());if(!member||!equalId(member.project_id,s.project_id as string))throw new Error('foreign_saved_inventory_reference');
 }
 const evidence=raw as unknown as ScopeInvoiceKernelEvidence;
 if(await scopeInvoiceInventoryFingerprint(evidence.source_inventory)!==evidence.captured_inventory_fingerprint)throw new Error('captured_inventory_hash_mismatch');
 if(capturedScopeInvoiceReferencesMatch(evidence.saved_source_references,evidence.source_inventory)!==evidence.captured_inventory_matches_current)throw new Error('captured_inventory_comparison_mismatch');
 if(!evidence.captured_inventory_matches_current&&!evidence.diagnostics.includes('captured_inventory_changed'))throw new Error('missing_inventory_change_diagnostic');
 return evidence;
}
export async function projectScopeInvoiceKernelEvidence(raw:unknown){
 const evidence=await validateScopeInvoiceKernelEvidence(raw);const diagnostics=[...evidence.diagnostics];let confirmed=0n,preliminary=0n,count=0;const excluded:string[]=[];
 for(const member of evidence.members){const child=projectLocalInvoiceKernelEvidence(member.kernel_evidence);diagnostics.push(...child.diagnostics);if(child.resolved_source_count){confirmed+=BigInt(child.kernel_result!.confirmed_minor);preliminary+=BigInt(child.kernel_result!.preliminary_minor);count+=child.resolved_source_count;}}
 for(const source of evidence.source_inventory)if(source.mapping_state!=='charging'){excluded.push(source.source_anchor);diagnostics.push('excluded_scope_source:'+source.source_anchor+':'+source.reason);}
 const minor=(v:bigint)=>{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('unsafe_scope_invoice_subtotal');return n;};
 return {schema_version:'operations-scope-invoice-kernel-projection.v1' as const,authority_scope:'canonical_scope_invoice_capture' as const,organization_id:evidence.organization_id,economic_scope_id:evidence.economic_scope_id,currency:evidence.currency,
 scope_snapshot_id:evidence.scope_snapshot_id,scope_revision:evidence.scope_revision,membership_fingerprint:evidence.membership_fingerprint,composition_snapshot_id:evidence.composition_snapshot_id,composition_revision:evidence.composition_revision,composition_fingerprint:evidence.composition_fingerprint,root_kind:evidence.root_kind,root_id:evidence.root_id,membership_currentness:evidence.membership_currentness,source_currentness:evidence.source_currentness,as_of:evidence.as_of,
 known_captured_invoice_cost_minor:count?minor(confirmed+preliminary):null,confirmed_captured_invoice_cost_minor:count?minor(confirmed):null,preliminary_captured_invoice_cost_minor:count?minor(preliminary):null,
 resolved_source_count:count,excluded_source_anchors:excluded,member_count:evidence.members.length,captured_inventory_fingerprint:evidence.captured_inventory_fingerprint,captured_inventory_matches_current:evidence.captured_inventory_matches_current,
 diagnostics,category_coverage:evidence.category_coverage,source_coverage:'unavailable' as const,credit_eligible:false as const,remaining_minor:null,eac_minor:null,budget_minor:null,margin_minor:null,shadow_only:true as const};
}
