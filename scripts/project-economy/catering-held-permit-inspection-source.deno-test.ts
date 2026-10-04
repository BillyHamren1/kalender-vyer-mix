/** Source parity/order only; does not fabricate positive delivered authority. */
const base=new URL("../../",import.meta.url);
const original=await Deno.readTextFile(new URL("supabase/migrations/20261002112625_operations_catering_reconciliation_historical_capture_v1.sql",base));
const candidate=await Deno.readTextFile(new URL("supabase/migrations/20261002180016_operations_catering_held_permit_inspection_v1.sql",base));
function assert(v:unknown):asserts v {if(!v)throw new Error("inspection_source_parity_failed");}
function definition(s:string,name:string){const a=s.indexOf("create function operations_catering_reconciliation_private."+name+"(");assert(a>=0);const b=s.indexOf("\nend;$$;",a);assert(b>=0);return s.slice(a,b+"\nend;$$;".length);}
Deno.test("inspection preserves original resolver economics and body derivation byte for byte",()=>{
 const old=definition(original,"resolve_permit_v1");const fresh=definition(candidate,"inspect_held_permit_candidate_v1");
 for(const [start,end] of [[" preview:=inventory->'preview';"," permit:=jsonb_build_object("],[" permit:=jsonb_build_object("," if octet_length(raw)>262144"],[" return inventory||jsonb_build_object(","\nend;$$;"]]){
   const a=old.slice(old.indexOf(start),old.indexOf(end,old.indexOf(start)));
   const b=fresh.slice(fresh.indexOf(start),fresh.indexOf(end.replace(" if octet_length(raw)>262144"," if clock_timestamp()>=deadline or octet_length(raw)>262144"),fresh.indexOf(start)));
   assert(a===b.replace(" p_permit_id:=gen_random_uuid();p_created_at:=clock_timestamp();\n","").replace(" if p_permit_id is null or p_created_at is null or p_created_at<transaction_timestamp() or p_created_at>clock_timestamp()\n then raise exception 'server permit identity/time invalid' using errcode='42501';end if;\n",""));
 }
});
Deno.test("inspection rejects unsupported isolation and budgets early authorization before held inventory",()=>{
 const s=definition(candidate,"inspect_held_permit_candidate_v1");const order=["current_setting('transaction_isolation')","set_config('lock_timeout','3s',true)","validate_permit_command_v1","authorize_scope_admin_v1","require_current_admission_receipt_scope_v1","inventory_held_v1","preview:=inventory","p_permit_id:=gen_random_uuid()","clock_timestamp()>=deadline"];
 let last=-1;for(const token of order){const at=s.indexOf(token);assert(at>last);last=at;}
});
Deno.test("no private storage writer public function grants or original resolver call added",()=>{
 assert(!/\b(?:insert|update|delete|truncate|grant)\b/i.test(candidate.replace(/^--.*$/gm,"")));
 assert(!candidate.includes("create table")&&!candidate.includes("create or replace"));
 assert(candidate.includes("revoke all on function operations_catering_reconciliation_private.inspect_held_permit_candidate_v1(text,uuid) from public,anon,authenticated,service_role;"));
 assert(!definition(candidate,"inspect_held_permit_candidate_v1").includes(".resolve_permit_v1("));
});
