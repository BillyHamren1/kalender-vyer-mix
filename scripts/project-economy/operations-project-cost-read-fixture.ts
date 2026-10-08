import { calculatePersonnelCostSnapshot } from '../../supabase/functions/_shared/project-personnel-cost.ts';
const f=JSON.parse(await Deno.readTextFile(Deno.args[0]));
const initial=f.initial;
const initialMissing=await calculatePersonnelCostSnapshot(f.raw, {
  organization_id:initial.organization_id,time_organization_id:f.raw.organizationId,
  time_auth_worker_id:f.raw.workerId,worker_id:initial.worker_id,
  source_time_stream_id:initial.source_time_stream_id,source_revision:1,project_review_status:'preliminary',
  allocations:initial.lines.map((line: Record<string, unknown>)=>({
    organization_id:initial.organization_id,source_time_line_id:line.source_time_line_id,
    target:f.raw.blocks.find((block: Record<string, unknown>)=>block.id===line.source_time_line_id).target,
    source_project_id:line.source_project_id,source_booking_id:line.source_booking_id,currency:line.currency,
  })),rates:[],
});
console.log(JSON.stringify({...f,initialMissing}));
