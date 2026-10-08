import {validateScopeInvoiceKernelEvidence,projectScopeInvoiceKernelEvidence} from '../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';
import {validateScopeInvoiceCaptureAdminEvidence,validateScopeInvoiceCaptureAdminRequest} from '../../supabase/functions/_shared/project-scope-invoice-capture-admin.ts';
const organization='11111111-1111-4111-8111-111111111111';
const fail=():never=>{throw new Error('invalid_compatible_scope_read_vectors');};
function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(k=>k!=='as_of').sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
export async function verifyCompatibleScopeReadVectors(raw:unknown):Promise<number> {
 if(!Array.isArray(raw)||raw.length!==8)return fail();
 const expected=new Set(['old_service_unknown','new_service_unknown','old_admin_unknown','new_admin_unknown','old_service_known','new_service_known','old_admin_known','new_admin_known']);
 const seen=new Map<string,{evidence:unknown;projected:unknown}>();
 for(const row of raw){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==3||!Object.hasOwn(row,'label')||!Object.hasOwn(row,'request')||!Object.hasOwn(row,'evidence')||typeof row.label!=='string'||!expected.has(row.label)||seen.has(row.label)||typeof row.evidence!=='string'||new TextEncoder().encode(row.evidence).length>262144)return fail();
  const reply=JSON.parse(row.evidence);
  let evidence;
  if(row.label.includes('_admin_')){
   const request=validateScopeInvoiceCaptureAdminRequest(row.request);
   evidence=(await validateScopeInvoiceCaptureAdminEvidence(reply,organization,request)).evidence;
  }else{
   const request=row.request;
   if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==7||request.schema_version!=='operations-scope-invoice-kernel-read.v1'||request.organization_id!==organization)return fail();
   evidence=await validateScopeInvoiceKernelEvidence(reply);
   if(evidence.organization_id!==request.organization_id||evidence.economic_scope_id!==request.economic_scope_id||evidence.scope_revision!==request.expected_scope_revision||evidence.membership_fingerprint!==request.expected_membership_fingerprint||evidence.composition_revision!==request.expected_composition_revision||evidence.composition_fingerprint!==request.expected_composition_fingerprint)return fail();
  }
  const projected=await projectScopeInvoiceKernelEvidence(evidence);
  if(evidence.source_coverage!=='unavailable'||evidence.credit_eligible!==false||projected.remaining_minor!==null||projected.eac_minor!==null||projected.budget_minor!==null||projected.margin_minor!==null)return fail();
  if(row.label.endsWith('_unknown')&&(evidence.source_inventory.length!==0||evidence.members.length!==1||projected.known_captured_invoice_cost_minor!==null))return fail();
  if(row.label.endsWith('_known')&&(evidence.source_inventory.length!==3||evidence.members.length!==3||typeof projected.known_captured_invoice_cost_minor!=='number'||!Number.isSafeInteger(projected.known_captured_invoice_cost_minor)||projected.known_captured_invoice_cost_minor<=0))return fail();
  seen.set(row.label,{evidence:reply,projected});
 }
 for(const pair of [['old_service_unknown','new_service_unknown'],['old_admin_unknown','new_admin_unknown'],['old_service_known','new_service_known'],['old_admin_known','new_admin_known']]){
  const left=seen.get(pair[0]),right=seen.get(pair[1]);
  if(!left||!right||canonical(left)!==canonical(right))return fail();
 }
 return seen.size;
}
if(import.meta.main){
 try{
  if(Deno.args.length!==1)fail();const source=await Deno.readTextFile(Deno.args[0]);
  if(new TextEncoder().encode(source).length>8*1024*1024)fail();
  const count=await verifyCompatibleScopeReadVectors(JSON.parse(source));
  console.log(`operations-scope-compatible-read-vectors PASS ${count} actual_sql_same_frozen_models_null_costs`);
 }catch{console.error('operations-scope-compatible-read-vectors FAIL closed');Deno.exit(1);}
}
