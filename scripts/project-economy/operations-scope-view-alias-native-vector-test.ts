/** Exact native SQL captures → unchanged contract-only alias helper. */
import {previewScopeViewAlias} from '../../supabase/functions/_shared/canonical-scope-view-alias.ts';
const labels:Record<string,{revision:number;bookings:number;error?:string}>={
 initial_project:{revision:1,bookings:2},initial_packing:{revision:1,bookings:2},
 before_legacy_writer:{revision:1,bookings:2},after_legacy_writer:{revision:1,bookings:2,error:'alias_canonical_graph_stale'},
 after_reenroll:{revision:2,bookings:2},policy_before:{revision:2,bookings:2},policy_restored:{revision:2,bookings:2},
 admin_before:{revision:2,bookings:2},admin_restored:{revision:2,bookings:2},
 legacy_insert_before:{revision:2,bookings:2},legacy_insert_after:{revision:2,bookings:3,error:'alias_permanent_owner_missing'},
 after_second_reenroll:{revision:3,bookings:3},
};
function assert(v:unknown,label:string):asserts v{if(v!==true)throw new Error('native_alias_vector_assertion:'+label);}
const path=Deno.args[0];if(!path)throw new Error('native_alias_vector_file_required');
const vectors:unknown=JSON.parse(await Deno.readTextFile(path));assert(Array.isArray(vectors)&&vectors.length===Object.keys(labels).length,'exact12');
const seen=new Set<string>();
for(const item of vectors as Record<string,unknown>[]){
 assert(!!item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===2&&Object.hasOwn(item,'label')&&Object.hasOwn(item,'capture'),'vector');
 assert(typeof item.label==='string'&&Object.hasOwn(labels,item.label)&&!seen.has(item.label),'label');seen.add(item.label);
 const c=item.capture as Record<string,unknown>,expected=labels[item.label];
 assert(!!c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length===7&&['schema_version','context','view_root_kind','view_root_id','view_canonical_scope_id','catalog','member_owners'].every(k=>Object.hasOwn(c,k)),'rawcapture');
 assert(c.schema_version==='operations-scope-alias-native-capture.v1'&&c.view_canonical_scope_id===null,'nativeonly');
 assert(c.view_root_kind==='project'||c.view_root_kind==='packing_project','viewkind');
 assert((c.context as Record<string,unknown>).canonical_scope_revision===expected.revision,'capturedrevision');
 let failed:string|null=null;
 try{
  const p=await previewScopeViewAlias(c.context,c.view_root_kind,c.view_root_id as string,c.catalog,c.member_owners);
  assert(!expected.error,'expectedfailure');
  assert(p.display_scope==='full_canonical_scope'&&p.required_authority==='live_organization_admin'&&p.integration_state==='contract_only'&&p.eac_minor===null&&p.economic_mapping==='unavailable','noauthoritymoney');
  assert(p.canonical_membership.organization_id==='11111111-1111-4111-8111-111111111111'&&p.economic_scope_id==='90909090-9090-4909-8909-909090909090','actualscope');
  assert(p.canonical_membership.local_booking_ids.length===expected.bookings&&p.canonical_membership.source_project_ids.length===expected.bookings,'genuinebookings');
  assert(p.view_membership.local_booking_ids.length===1&&p.additional_local_booking_ids.length===expected.bookings-1&&p.additional_source_project_ids.length===expected.bookings-1,'fullscopeadditional');
  assert(p.canonical_membership.local_booking_ids.includes('Alias-𐀀-Order-99'),'exactlegacyUnicode');
 }catch(error){failed=error instanceof Error?error.message:String(error);}
 assert(expected.error?failed===expected.error:failed===null,'exactresult:'+item.label+':'+failed);
}
assert(seen.size===Object.keys(labels).length,'alllabels');
console.log('operations-scope-view-alias-native-vectors PASS 12');
