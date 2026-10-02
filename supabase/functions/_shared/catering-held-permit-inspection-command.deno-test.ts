import { encodeHeldPermitInspectionCommand, heldPermitInspectionCommandHash } from "./catering-held-permit-inspection-command.ts";
const id="00000000-0000-4000-8000-000000000001";
const command={schema_version:"operations-catering-reconciliation-command.v1",source_stream_id:"catering:"+id+":"+id,expected_publication_revision:3,expected_allocation_revision:2,expected_event_id:id,expected_observation_id:id,expected_mapping_id:id,finance_cursor_id:id,finance_cursor_sha256:"a".repeat(64),preview_sha256:"b".repeat(64),idempotency_key:"inspection-only-key",reason:"Unicode 🧪 quoted \"reason\"\nsecond line"};
function assert(v:unknown):asserts v {if(!v)throw new Error("inspection_command_test_failed");}
function deny(raw:string){let denied=false;try{encodeHeldPermitInspectionCommand(raw);}catch{denied=true;}assert(denied);}
Deno.test("inspection command plain canonical commitment independent of key order",async()=>{
 const raw=JSON.stringify(command);const reversed=JSON.stringify(Object.fromEntries(Object.entries(command).reverse()));
 const encoded=encodeHeldPermitInspectionCommand(raw);assert(encoded===encodeHeldPermitInspectionCommand(reversed));
 const hash=await heldPermitInspectionCommandHash(raw);
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encoded)));
 assert(hash===Array.from(digest,b=>b.toString(16).padStart(2,"0")).join(""));
});
Deno.test("original exact12 safe lexical integers UUID hashes and ECMA trim remain strict",()=>{
 for(const change of [{reason:"\tbad"},{reason:"bad\u00a0"},{idempotency_key:"short"},{expected_event_id:id.toUpperCase().replace("0000","FFFF")},{finance_cursor_sha256:["a".repeat(64)]},{expected_allocation_revision:0},{expected_publication_revision:1.5},{extra:"private"},{schema_version:null}])deny(JSON.stringify({...command,...change}));
 const raw=JSON.stringify(command);deny(raw.replace('"expected_publication_revision":3','"expected_publication_revision":3e0'));deny(raw.replace('"expected_publication_revision":3','"expected_publication_revision":-0'));
 deny(raw.replace('"reason":','"re\\u0061son":"duplicate","reason":'));deny(raw.replace('"reason":','"reason":"duplicate","reason":'));
});
Deno.test("PostgreSQL character lengths retain Unicode scalar count",()=>{
 const raw=JSON.stringify({...command,reason:"🧪".repeat(1000)});
 assert(typeof encodeHeldPermitInspectionCommand(raw)==="string");deny(JSON.stringify({...command,reason:"🧪".repeat(1001)}));
});
