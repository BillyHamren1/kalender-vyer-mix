import {calculateProjectCostObligation,type CostObligationInput,type CostObligationResult} from './project-cost-obligations.ts';
/** Service-captured evidence only. Validation is integrity, not authority. */
export interface LocalInvoiceKernelEvidence {
 schema_version:'operations-invoice-obligation-kernel-evidence.v1';state:'captured'|'unsupported_basis';authority_scope:'local_project_only';source_currentness:'saved_receiver_heads_only';
 organization_id:string;project_id:string;obligation_id:string;category_coverage:'unavailable';source_coverage:'unavailable';as_of:string;
 baseline:{event_id:string;revision:number;fingerprint:string;evidence_basis:'operations_manual';currency:string;category:'personnel'|'supplier'|'catering'|'other';cost_basis:'time'|'invoice'|'other';estimate_minor:number|null;committed_minor:number|null};
 sources:{source_anchor:string;binding_event_id:string;source_organization_id:string;invoice_id:string;source_snapshot_id:string;source_economic_revision:number;source_economic_fingerprint:string;source_raw_sha256:string;
 resolved:boolean;reason:string|null;current_snapshot_id:string|null;current_raw_sha256:string|null;status:'preliminary'|'confirmed'|null;amount_minor:number|null;
 policy_state:'current'|'missing'|'stale';policy_event_id:string|null;policy_revision:number|null;policy_fingerprint:string|null;replaces_estimate_minor:number|null;consumes_commitment_minor:number|null}[];
 diagnostics:string[];credit_eligible:false;shadow_only:true;eac_minor:null;remaining_minor:null;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const count=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const money=(v:unknown)=>v===null||count(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function timestamp(value:unknown):value is string {
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
 if(!match||!Number.isFinite(Date.parse(value)))return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);
 return calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month-1&&calendar.getUTCDate()===day;
}
const sourceKeys=['source_anchor','binding_event_id','source_organization_id','invoice_id','source_snapshot_id','source_economic_revision','source_economic_fingerprint','source_raw_sha256','resolved','reason','current_snapshot_id','current_raw_sha256','status','amount_minor','policy_state','policy_event_id','policy_revision','policy_fingerprint','replaces_estimate_minor','consumes_commitment_minor'];
export function validateLocalInvoiceKernelEvidence(raw:unknown):LocalInvoiceKernelEvidence{
 if(!exact(raw,['schema_version','state','authority_scope','source_currentness','organization_id','project_id','obligation_id','category_coverage','source_coverage','as_of','baseline','sources','diagnostics','credit_eligible','shadow_only','eac_minor','remaining_minor'])||raw.schema_version!=='operations-invoice-obligation-kernel-evidence.v1'||typeof raw.state!=='string'||!['captured','unsupported_basis'].includes(raw.state)||raw.authority_scope!=='local_project_only'||raw.source_currentness!=='saved_receiver_heads_only'||!uuid(raw.organization_id)||!uuid(raw.project_id)||!uuid(raw.obligation_id)||raw.category_coverage!=='unavailable'||raw.source_coverage!=='unavailable'||!timestamp(raw.as_of)||raw.credit_eligible!==false||raw.shadow_only!==true||raw.eac_minor!==null||raw.remaining_minor!==null||!Array.isArray(raw.diagnostics)||raw.diagnostics.some(v=>typeof v!=='string')||!Array.isArray(raw.sources)||raw.sources.length>10000)throw new Error('invalid_local_kernel_evidence');
 const b=raw.baseline;
 if(!exact(b,['event_id','revision','fingerprint','evidence_basis','currency','category','cost_basis','estimate_minor','committed_minor'])||!uuid(b.event_id)||!count(b.revision,1)||!hash(b.fingerprint)||b.evidence_basis!=='operations_manual'||typeof b.currency!=='string'||!/^[A-Z]{3}$/.test(b.currency)||typeof b.category!=='string'||!['personnel','supplier','catering','other'].includes(b.category)||typeof b.cost_basis!=='string'||!['time','invoice','other'].includes(b.cost_basis)||!money(b.estimate_minor)||!money(b.committed_minor)||((raw.state==='captured')!==(b.cost_basis==='invoice'))||(raw.state==='unsupported_basis'&&raw.sources.length!==0))throw new Error('invalid_local_kernel_baseline');
 const seen=new Set<string>();
 for(const s of raw.sources){
 if(!exact(s,sourceKeys)||!hash(s.source_anchor)||seen.has(s.source_anchor)||!['binding_event_id','source_organization_id','invoice_id','source_snapshot_id'].every(k=>uuid(s[k]))||!count(s.source_economic_revision,1)||!hash(s.source_economic_fingerprint)||!hash(s.source_raw_sha256)||typeof s.resolved!=='boolean'||typeof s.policy_state!=='string'||!['current','missing','stale'].includes(s.policy_state)||!money(s.replaces_estimate_minor)||!money(s.consumes_commitment_minor))throw new Error('invalid_local_kernel_source');
 seen.add(s.source_anchor);
 if(s.resolved){if(s.reason!==null||!uuid(s.current_snapshot_id)||!hash(s.current_raw_sha256)||typeof s.status!=='string'||!['preliminary','confirmed'].includes(s.status)||!count(s.amount_minor,1))throw new Error('invalid_resolved_kernel_source');}
 else if(typeof s.reason!=='string'||!s.reason||s.status!==null||s.amount_minor!==null||s.current_snapshot_id!==null||s.current_raw_sha256!==null||s.policy_state==='current')throw new Error('invalid_unresolved_kernel_source');
 if(s.policy_state==='missing'){if(s.policy_event_id!==null||s.policy_revision!==null||s.policy_fingerprint!==null)throw new Error('invalid_missing_kernel_policy');}
 else if(!uuid(s.policy_event_id)||!count(s.policy_revision,1)||!hash(s.policy_fingerprint))throw new Error('invalid_saved_kernel_policy');
 if(s.policy_state!=='current'&&(s.replaces_estimate_minor!==null||s.consumes_commitment_minor!==null))throw new Error('stale_policy_money_cannot_enter_kernel');
 if(b.estimate_minor===null&&s.replaces_estimate_minor!==null||b.committed_minor===null&&s.consumes_commitment_minor!==null)throw new Error('unknown_baseline_policy_must_remain_null');
 }
 return raw as unknown as LocalInvoiceKernelEvidence;
}
export interface LocalInvoiceKernelProjection {
 schema_version:'operations-local-invoice-kernel-projection.v1';authority_scope:'local_project_only';source_currentness:'saved_receiver_heads_only';
 kernel_input:CostObligationInput|null;kernel_result:CostObligationResult|null;known_captured_cost_minor:number|null;
 resolved_source_count:number;excluded_source_anchors:string[];diagnostics:string[];category_coverage:'unavailable';source_coverage:'unavailable';remaining_minor:null;eac_minor:null;credit_eligible:false;shadow_only:true;
}
export function projectLocalInvoiceKernelEvidence(raw:unknown):LocalInvoiceKernelProjection{
 const evidence=validateLocalInvoiceKernelEvidence(raw);const diagnostics=[...evidence.diagnostics];
 const excluded=evidence.sources.filter(s=>!s.resolved);const resolved=evidence.sources.filter(s=>s.resolved);
 const b=evidence.baseline;
 const input:CostObligationInput|null=evidence.state==='unsupported_basis'?null:{organization_id:evidence.organization_id,project_id:evidence.project_id,obligation_id:evidence.obligation_id,currency:b.currency,cost_basis:'invoice',estimate_minor:b.estimate_minor,committed_minor:b.committed_minor,relation_coverage:'unresolved',sources:resolved.map(s=>({source_id:'invoice:'+s.source_anchor,organization_id:evidence.organization_id,project_id:evidence.project_id,obligation_id:evidence.obligation_id,currency:b.currency,kind:'invoice',status:s.status!,amount_minor:s.amount_minor,replaces_estimate_minor:s.replaces_estimate_minor,consumes_commitment_minor:s.consumes_commitment_minor,credited_source_id:null,relation_coverage:'complete'}))};
 for(const s of excluded)diagnostics.push('excluded_source:'+s.source_anchor+':'+s.reason);
 for(const s of resolved)if(s.policy_state!=='current')diagnostics.push('unavailable_source_policy:'+s.source_anchor);
 const result=input===null?null:calculateProjectCostObligation(input);
 return {schema_version:'operations-local-invoice-kernel-projection.v1',authority_scope:'local_project_only',source_currentness:'saved_receiver_heads_only',kernel_input:input,kernel_result:result,known_captured_cost_minor:resolved.length===0?null:result!.known_cost_minor,resolved_source_count:resolved.length,excluded_source_anchors:excluded.map(s=>s.source_anchor),diagnostics,category_coverage:'unavailable',source_coverage:'unavailable',remaining_minor:null,eac_minor:null,credit_eligible:false,shadow_only:true};
}
