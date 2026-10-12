// Disposable owner-schema data plus actual cost calculator and private issuer.
// No product edits; caller must install reviewed TEXT compatibility before use.
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function prepareMixedSource(c,engine){
 const {db,org,ctx,fixture,command,makeIssuerRequest,v2epoch}=c;
 const stream=ctx.worker_id+':2026-10-02';
 await db.query('insert into operations_economy_private.personnel_issuer_streams_v1 select issuer_id,enrollment_epoch,$3,0,source_binding from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=$1 and enrollment_epoch=$2 and source_stream_id=$4',[c.issuer,v2epoch,stream,c.stream]);
 const internal=ctx.allocations[0].source_project_id,customer=randomUUID(),activity=randomUUID(),booking='BK/synthetic-opaque:å';
 await db.query('insert into bookings(id,organization_id,is_internal) values($1,$2,false)',[booking,org]);
 await db.query("insert into projects(id,organization_id,booking_id,project_kind,is_internal) values($1,$2,$3,'customer',false)",[customer,org,booking]);
 await db.query("insert into projects(id,organization_id,project_kind,is_internal,budget_cost_minor,budget_currency) values($1,$2,'internal_activity',false,100000,'SEK')",[activity,org]);
 await db.query('select enroll_customer_identity_metadata_v1($1,$2)',[customer,booking]);
 await db.query('update operations_project_metadata_destinations set enabled=true where source_project_id=$1',[customer]);
 await db.query('insert into operations_project_metadata_destinations(source_project_id,source_organization_id,first_revision,enabled) values($1,$2,1,true)',[activity,org]);
 const parts=[{id:'customer-4h',project:customer,booking,minutes:240,kind:'customer'},{id:'internal-3h',project:internal,booking:null,minutes:180,kind:'internal_project'},{id:'activity-1h',project:activity,booking:null,minutes:60,kind:'internal_activity'}];
 for(const p of parts.filter(p=>p.kind!=='internal_project'))await db.query("insert into operations_personnel_target_bindings values($1,'planning','project',$2,'binding-v1',$3,$4,'SEK','synthetic explicit mixed target')",[org,p.project,p.project,p.booking]);
 let revision=0,version=0;
 const issue=async selected=>{
  let hour=8;
  const blocks=selected.map(p=>{const start=hour;hour+=p.minutes/60;return{id:p.id,kind:'work',durationMinutes:p.minutes,startsAt:`2026-10-02T${String(start).padStart(2,'0')}:00:00Z`,endsAt:`2026-10-02T${String(hour).padStart(2,'0')}:00:00Z`,target:{sourceSystem:'planning',kind:'project',externalId:p.project,version:'binding-v1'},requiresTargetConfirmation:true}});
  const raw=await fixture({workDate:'2026-10-02',version:++version,blocks,attestation:{confirmedByWorker:true,targetKeys:blocks.map(b=>[b.target.sourceSystem,b.target.kind,b.target.externalId,b.target.version].join(':'))}});
  const allocations=selected.map((p,i)=>({...ctx.allocations[0],source_time_line_id:p.id,source_project_id:p.project,source_booking_id:p.booking,target:blocks[i].target}));
  const snapshot=await engine.calculatePersonnelCostSnapshot(raw,{...ctx,source_time_stream_id:stream,source_revision:revision+1,allocations});
  const rawtext=JSON.stringify(raw),cmd={...command,enrollment_epoch:v2epoch,source_stream_id:stream,expected_revision:revision,idempotency_key:'mixed-causal-version-'+version,snapshot,raw_time_snapshot:raw,source_evidence:{...command.source_evidence,raw_snapshot:rawtext,raw_snapshot_sha256:createHash('sha256').update(rawtext).digest('hex')}};
  const req=makeIssuerRequest(cmd),issued=(await db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[req.body,req.timestamp,req.nonce,req.signature])).rows[0].r;
  const record=(await db.query('select * from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=$1',[issued.outbox_id])).rows[0];
  revision++;assert.equal(JSON.parse(record.raw_envelope).source_revision,revision);return record;
 };
 return{parts,issue,stream,booking,internal,customer,activity,first:()=>issue(parts),correction:()=>issue([{...parts[0],minutes:240},{...parts[1],minutes:120}]),empty:()=>issue([])};
}
