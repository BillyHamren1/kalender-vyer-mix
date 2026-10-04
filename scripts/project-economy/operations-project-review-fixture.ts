import {calculatePersonnelCostSnapshot,type FrozenTimeSnapshot,type PersonnelCalculationContext} from '../../supabase/functions/_shared/project-personnel-cost.ts';
import {projectPersonnelEconomicsFingerprint} from '../../supabase/functions/_shared/project-personnel-project-review.ts';
// Derive a two-project isolated document from the proven engine fixture; no live source.
const f=JSON.parse(await Deno.readTextFile(Deno.args[0]));
const {id:_id,snapshotHash:_hash,...unsigned}=f.raw;
const a='55555555-5555-4555-8555-555555555555',b='77777777-7777-4777-8777-777777777777';
const second={...unsigned.blocks[0],id:'line-b',startsAt:'2026-10-01T10:00:00Z',endsAt:'2026-10-01T12:00:00Z',
  target:{sourceSystem:'planning',kind:'project',externalId:b,version:'binding-v1'}};
unsigned.blocks=[...unsigned.blocks,second];
unsigned.attestation={...unsigned.attestation,targetKeys:[...unsigned.attestation.targetKeys,'planning:project:'+b+':binding-v1']};
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
async function freeze(document:typeof unsigned):Promise<FrozenTimeSnapshot>{
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(document))))),n=>n.toString(16).padStart(2,'0')).join('');
  return {...document,id:`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`,snapshotHash:hash} as FrozenTimeSnapshot;
}
const raw=await freeze(unsigned);
const ctx:PersonnelCalculationContext={organization_id:'11111111-1111-4111-8111-111111111111',time_organization_id:raw.organizationId,
  time_auth_worker_id:raw.workerId,worker_id:'44444444-4444-4444-8444-444444444444',
  source_time_stream_id:`time:${raw.organizationId}:99999999-9999-4999-8999-999999999999:${raw.workDate}`,source_revision:1,project_review_status:'preliminary',
  allocations:[{organization_id:'11111111-1111-4111-8111-111111111111',source_time_line_id:raw.blocks[0].id,target:raw.blocks[0].target!,source_project_id:a,
    source_booking_id:'66666666-6666-4666-8666-666666666666',currency:'SEK'},
    {organization_id:'11111111-1111-4111-8111-111111111111',source_time_line_id:'line-b',target:second.target,source_project_id:b,source_booking_id:null,currency:'SEK'}],
  rates:[{organization_id:'11111111-1111-4111-8111-111111111111',worker_id:'44444444-4444-4444-8444-444444444444',category:'work',currency:'SEK',
    rate_revision:'rate-v1',hourly_rate_minor:30000,effective_from:'2026-10-01',effective_to:'2026-10-02'}]};
const snapshot=await calculatePersonnelCostSnapshot(raw,ctx);
const rawCorrection=await freeze({...unsigned,version:2,blocks:unsigned.blocks.map((block:any,index:number)=>index===0?{...block,durationMinutes:90,endsAt:'2026-10-01T09:30:00Z'}:block)});
const corrected=await calculatePersonnelCostSnapshot(rawCorrection,{...ctx,source_revision:5});
const rawEmpty=await freeze({...unsigned,version:3,blocks:[]});
const empty=await calculatePersonnelCostSnapshot(rawEmpty,{...ctx,source_revision:6,allocations:[]});
console.log(JSON.stringify({raw,snapshot,rawCorrection,corrected,rawEmpty,empty,projectAHash:await projectPersonnelEconomicsFingerprint(snapshot,a),projectBHash:await projectPersonnelEconomicsFingerprint(snapshot,b)}));
