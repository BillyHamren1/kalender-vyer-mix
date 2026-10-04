import {projectScopeInvoiceKernelEvidence,validateScopeInvoiceKernelEvidence} from '../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';

const byteOrder=(a:string,b:string):number=>{
 const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
 for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;
};
function canonical(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new Error('unsafe_native_publication_number');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(typeof value==='object'&&value!==null)return '{'+Object.keys(value).sort(byteOrder).map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 throw new Error('invalid_native_publication_canonical_value');
}
async function sha(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const audited=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v.trim()===v&&[...v].length>=min&&[...v].length<=max&&![...v].some(c=>c.codePointAt(0)!>=0xd800&&c.codePointAt(0)!<=0xdfff);
export async function verifyNativePublicationVectors(raw:unknown):Promise<number>{
 if(!Array.isArray(raw)||!raw.length||raw.length>32)throw new Error('invalid_native_publication_vector_catalog');
 const seen=new Set<string>();let last=0;
 for(const row of raw){
 if(!row||typeof row!=='object'||Object.keys(row).length!==6||!['label','capture','projection','document','evidence_fingerprint','publication_fingerprint'].every(k=>Object.hasOwn(row,k))
 ||typeof row.label!=='string'||!/^(?:direct|native)_[1-9][0-9]*$/.test(row.label)||seen.has(row.label)
 ||!['capture','projection','document'].every(k=>typeof row[k]==='string')||!['evidence_fingerprint','publication_fingerprint'].every(k=>typeof row[k]==='string'&&/^[0-9a-f]{64}$/.test(row[k])))throw new Error('invalid_native_publication_vector');
 seen.add(row.label);
 const capture=await validateScopeInvoiceKernelEvidence(JSON.parse(row.capture));
 const projected=await projectScopeInvoiceKernelEvidence(capture),saved=JSON.parse(row.projection),document=JSON.parse(row.document);
 if(canonical(projected)!==canonical(saved))throw new Error('native_saved_kernel_projection_mismatch');
 const documentKeys=['schema_version','publication_id','organization_id','economic_scope_id','publication_revision','actor_id','command','calculation_version','capture','projection','evidence_fingerprint','observed_at','delivery_state','shadow_only'];
 if(!document||typeof document!=='object'||Array.isArray(document)||Object.keys(document).length!==14||!documentKeys.every(k=>Object.hasOwn(document,k))||document.schema_version!=='operations-scope-publication-native-saved.v1'
 ||!uuid(document.publication_id)||!uuid(document.actor_id)
 ||document.organization_id!==capture.organization_id||document.economic_scope_id!==capture.economic_scope_id
 ||!Number.isSafeInteger(document.publication_revision)||document.publication_revision<=last||document.observed_at!==capture.as_of
 ||canonical(document.capture)!==canonical(capture)||canonical(document.projection)!==canonical(projected)
 ||document.evidence_fingerprint!==row.evidence_fingerprint||document.delivery_state!=='blocked_missing_authoritative_destination'||document.shadow_only!==true
 ||document.calculation_version!=='operations-invoice-kernel-native-prototype.v1')throw new Error('native_saved_publication_identity_mismatch');
 const command=document.command,commandKeys=['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_publication_revision','idempotency_key','reason'];
 if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).length!==9||!commandKeys.every(k=>Object.hasOwn(command,k))
 ||command.schema_version!=='operations-scope-publication-native.v1'||typeof command.economic_scope_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.economic_scope_id)||command.economic_scope_id.toLowerCase()!==capture.economic_scope_id
 ||command.expected_scope_revision!==capture.scope_revision||command.expected_membership_fingerprint!==capture.membership_fingerprint
 ||command.expected_composition_revision!==capture.composition_revision||command.expected_composition_fingerprint!==capture.composition_fingerprint
 ||!Number.isSafeInteger(command.expected_publication_revision)||command.expected_publication_revision<0||command.expected_publication_revision+1!==document.publication_revision
 ||!audited(command.idempotency_key,12,200)||!audited(command.reason,3,1000))throw new Error('native_saved_publication_command_mismatch');
 if(Number(row.label.split('_')[1])!==document.publication_revision)throw new Error('native_saved_publication_label_mismatch');
 last=document.publication_revision;
 const withoutTime={...capture} as Record<string,unknown>;delete withoutTime.as_of;
 if(await sha('operations-scope-publication-native-evidence-v1\n'+canonical(withoutTime))!==row.evidence_fingerprint
 ||await sha('operations-scope-publication-native-publication-v1\n'+canonical(document))!==row.publication_fingerprint)throw new Error('native_publication_canonical_fingerprint_mismatch');
 if(projected.eac_minor!==null||projected.remaining_minor!==null||projected.budget_minor!==null||projected.margin_minor!==null||projected.credit_eligible!==false||projected.source_coverage!=='unavailable')throw new Error('native_publication_unknowns_changed');
 }
 return raw.length;
}
if(import.meta.main){
 if(Deno.args.length!==1)throw new Error('expected_native_publication_vectors_path');
 const count=await verifyNativePublicationVectors(JSON.parse(await Deno.readTextFile(Deno.args[0])));
 console.log('whole-scope-publication-transaction-vectors PASS '+count+' actual_saved_sql_to_unchanged_kernel');
}
