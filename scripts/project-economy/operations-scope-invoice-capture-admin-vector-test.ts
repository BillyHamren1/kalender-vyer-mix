import { validateScopeInvoiceCaptureAdminRequest,validateScopeInvoiceCaptureAdminEvidence } from '../../supabase/functions/_shared/project-scope-invoice-capture-admin.ts';
import { projectScopeInvoiceKernelEvidence } from '../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';

export async function verifyScopeInvoiceCaptureAdminVectors(rows:unknown):Promise<void>{
 const labels=['admin_initial','admin_new_policy','admin_corrected_source','admin_empty_selection'];
 if(!Array.isArray(rows)||rows.length!==4)throw new Error('four_actual_admin_vectors_required');
 const seen=new Set<string>();
 for(const row of rows){
 if(!row||typeof row!=='object'||Object.keys(row).length!==3||typeof row.label!=='string'||!labels.includes(row.label)||seen.has(row.label)||typeof row.evidence!=='string'||typeof row.request!=='string')throw new Error('exact_unique_admin_vector_required');
 seen.add(row.label);const request=validateScopeInvoiceCaptureAdminRequest(JSON.parse(row.request));
 const value=await validateScopeInvoiceCaptureAdminEvidence(JSON.parse(row.evidence),'11111111-1111-4111-8111-111111111111',request);
 const projection=await projectScopeInvoiceKernelEvidence(value.evidence);
 const expected=row.label==='admin_empty_selection'?null:row.label==='admin_corrected_source'?1000:541000;
 if(projection.known_captured_invoice_cost_minor!==expected||projection.preliminary_captured_invoice_cost_minor!==expected||projection.confirmed_captured_invoice_cost_minor!==(expected===null?null:0)||projection.eac_minor!==null||projection.remaining_minor!==null||projection.budget_minor!==null||projection.margin_minor!==null||projection.credit_eligible!==false||projection.source_coverage!=='unavailable'||Object.values(projection.category_coverage).some(v=>v!=='unavailable'))throw new Error('admin_copy_or_unknown_coverage_changed');
 if(row.label==='admin_corrected_source'&&projection.excluded_source_anchors.length!==2)throw new Error('admin_old_source_money_reused');
 if(row.label==='admin_empty_selection'&&(value.evidence.members.length||value.evidence.source_inventory.length))throw new Error('admin_empty_evidence_fabricated');
 }
}
if(import.meta.main){
 if(Deno.args.length!==1)throw new Error('actual_admin_vector_file_required');
 await verifyScopeInvoiceCaptureAdminVectors(JSON.parse(await Deno.readTextFile(Deno.args[0])));
 console.log('operations-scope-invoice-capture-admin-native-vectors PASS 4');
}
