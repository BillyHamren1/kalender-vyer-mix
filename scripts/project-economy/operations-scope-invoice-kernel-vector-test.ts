import{projectScopeInvoiceKernelEvidence,validateScopeInvoiceKernelEvidence}from'../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';
export async function verifyScopeInvoiceKernelVectors(raw:unknown):Promise<void>{
 const labels=['split_initial','new_policy','coequal_v2','higher_v2','empty_selection'];
 if(!Array.isArray(raw)||raw.length!==labels.length)throw new Error('invalid_scope_vector_catalog');const seen=new Set<string>();
 for(const row of raw){
 if(!row||typeof row!=='object'||Object.keys(row).length!==2||typeof row.label!=='string'||!labels.includes(row.label)||seen.has(row.label)||typeof row.evidence!=='string')throw new Error('invalid_scope_sql_vector');seen.add(row.label);
 const evidence=await validateScopeInvoiceKernelEvidence(JSON.parse(row.evidence)),p=await projectScopeInvoiceKernelEvidence(evidence);const charged=['split_initial','new_policy','coequal_v2'].includes(row.label);
 if(p.known_captured_invoice_cost_minor!==(charged?540000:null)||p.preliminary_captured_invoice_cost_minor!==(charged?540000:null)||p.confirmed_captured_invoice_cost_minor!==(charged?0:null)||p.resolved_source_count!==(charged?2:0)||p.eac_minor!==null||p.budget_minor!==null||p.remaining_minor!==null||p.credit_eligible!==false||p.source_coverage!=='unavailable')throw new Error('wrong_scope_projection:'+row.label);
 if(row.label==='empty_selection'){if(evidence.members.length||evidence.source_inventory.length)throw new Error('empty_selection_changed');continue;}
 if(evidence.members.length!==3||evidence.source_inventory.length!==2||new Set(evidence.source_inventory.map(s=>s.invoice_id)).size!==1||new Set(evidence.source_inventory.map(s=>s.source_anchor)).size!==2)throw new Error('split_allocation_or_unsupported_member_lost');
 const invoiceMembers=evidence.members.filter(m=>m.kernel_evidence.state==='captured');if(invoiceMembers.length!==2||invoiceMembers.some(m=>m.kernel_evidence.sources.length!==1))throw new Error('duplicate_invoice_portion');
 if(row.label==='split_initial'&&!evidence.captured_inventory_matches_current)throw new Error('initial_inventory_not_current');
 if(row.label!=='split_initial'&&evidence.captured_inventory_matches_current)throw new Error('saved_inventory_silently_refreshed');
 if(row.label==='new_policy'||row.label==='coequal_v2'){
 const first=invoiceMembers.find(m=>m.project_id==='55555555-5555-4555-8555-555555555555')!;
 if(first.kernel_evidence.sources[0].replaces_estimate_minor!==350000||first.kernel_evidence.sources[0].amount_minor!==270000||first.kernel_evidence.baseline.committed_minor!==null)throw new Error('planned_variance_or_null_changed');
 }
 if(row.label==='higher_v2'&&(p.excluded_source_anchors.length!==2||evidence.source_inventory.some(s=>s.mapping_state!=='excluded')))throw new Error('excluded_anchor_or_old_money_reused');
 }
}
export async function verifyScopeInvoiceNativeRaceVectors(raw:unknown):Promise<void>{
 const labels=['policy_before','policy_after','counterpart_before','counterpart_after','sources_before','sources_after','baseline_before','graph_before'];
 if(!Array.isArray(raw)||raw.length!==labels.length)throw new Error('invalid_scope_native_race_vectors');const seen=new Set<string>();
 for(const row of raw){
 if(!row||typeof row!=='object'||Object.keys(row).length!==2||typeof row.label!=='string'||!labels.includes(row.label)||seen.has(row.label)||typeof row.evidence!=='string')throw new Error('invalid_scope_native_race_vector');seen.add(row.label);
 const evidence=await validateScopeInvoiceKernelEvidence(JSON.parse(row.evidence)),p=await projectScopeInvoiceKernelEvidence(evidence);
 const charged=!['sources_after','baseline_before','graph_before'].includes(row.label);
 if(p.known_captured_invoice_cost_minor!==(charged?541000:null)||p.preliminary_captured_invoice_cost_minor!==(charged?541000:null)||p.confirmed_captured_invoice_cost_minor!==(charged?0:null)||p.resolved_source_count!==(charged?3:0)||p.eac_minor!==null||p.budget_minor!==null||p.remaining_minor!==null||p.credit_eligible!==false||p.source_coverage!=='unavailable'||evidence.members.length!==3||evidence.source_inventory.length!==3||new Set(evidence.source_inventory.map(s=>s.invoice_id)).size!==2)throw new Error('wrong_scope_native_race_projection:'+row.label);
 if(!charged&&p.excluded_source_anchors.length!==3)throw new Error('native_excluded_anchor_lost');
 }
}
if(import.meta.main){
 if(Deno.args.length===1){await verifyScopeInvoiceKernelVectors(JSON.parse(await Deno.readTextFile(Deno.args[0])));console.log('operations-scope-invoice-kernel-native-vectors PASS 5');}
 else if(Deno.args.length===2&&Deno.args[1]==='--native-races'){await verifyScopeInvoiceNativeRaceVectors(JSON.parse(await Deno.readTextFile(Deno.args[0])));console.log('operations-scope-invoice-kernel-native-race-vectors PASS 8');}
 else throw new Error('expected_scope_sql_vectors_path');
}
