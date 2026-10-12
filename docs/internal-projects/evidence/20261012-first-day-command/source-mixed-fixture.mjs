// Disposable owner-schema data plus actual cost calculator and private issuer.
// No product edits; caller must install reviewed TEXT compatibility before use.
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {prepareCaller} from './caller-oracle.mjs';
export async function prepareMixedSource(c,engine){
 const {db,org,ctx,fixture,command,makeIssuerRequest,v2epoch}=c;
 const binding=(await db.query('select * from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,c.worker])).rows[0];
 const stream=`time:${binding.time_organization_id}:${binding.time_personnel_id}:2026-10-02`;
 const internal=ctx.allocations[0].source_project_id,customer=randomUUID(),activity=randomUUID(),booking='BK/synthetic-opaque:å';
 await db.query('insert into bookings(id,organization_id,is_internal) values($1,$2,false)',[booking,org]);
 await db.query("insert into projects(id,organization_id,booking_id,project_kind,is_internal) values($1,$2,$3,'customer',false)",[customer,org,booking]);
 await db.query("insert into projects(id,organization_id,project_kind,is_internal,budget_cost_minor,budget_currency) values($1,$2,'internal_activity',false,100000,'SEK')",[activity,org]);
 await db.query('select enroll_customer_identity_metadata_v1($1,$2)',[customer,booking]);
 await db.query('update operations_project_metadata_destinations set enabled=true where source_project_id=$1',[customer]);
 await db.query('insert into operations_project_metadata_destinations(source_project_id,source_organization_id,first_revision,enabled) values($1,$2,1,true)',[activity,org]);
 const parts=[{id:'customer-4h',project:customer,booking,minutes:240,kind:'customer'},{id:'internal-3h',project:internal,booking:null,minutes:180,kind:'internal_project'},{id:'activity-1h',project:activity,booking:null,minutes:60,kind:'internal_activity'}];
 for(const p of parts.filter(p=>p.kind!=='internal_project'))await db.query("insert into operations_personnel_target_bindings values($1,'planning','project',$2,'binding-v1',$3,$4,'SEK','synthetic explicit mixed target')",[org,p.project,p.project,p.booking]);
 const bootstrap=process.env.ACCEPTED_FIRST_DAY==='1';
 if(!bootstrap){
 // Explicit synthetic, nonaccepted empty source seed. Genuine canonical ingress
 // creates head1; no accepted marker or delivery status is manufactured.
 const seed=await fixture({workDate:'2026-10-02',version:1,blocks:[],attestation:{confirmedByWorker:true,targetKeys:[]}});
 const seedSnapshot=await engine.calculatePersonnelCostSnapshot(seed,{...ctx,source_time_stream_id:stream,source_revision:1,allocations:[]});
 const seedText=JSON.stringify(seed),seedEvidence={...command.source_evidence,raw_snapshot:seedText,raw_snapshot_sha256:createHash('sha256').update(seedText).digest('hex')};
 await db.query('select publish_operations_personnel_cost_ingress_v1($1,$2,$3,0,$4)',[seedSnapshot,seed,seedEvidence,'synthetic-unissued-empty-seed']);
 assert.equal((await db.query('select count(*)::int n from operations_economy_private.personnel_accepted_issuances_v1 m join operations_personnel_cost_outbox o on o.id=m.outbox_id where o.source_time_stream_id=$1',[stream])).rows[0].n,0);
 await db.query('insert into operations_economy_private.personnel_issuer_streams_v1 select issuer_id,enrollment_epoch,$3,1,source_binding from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=$1 and enrollment_epoch=$2 and source_stream_id=$4',[c.issuer,v2epoch,stream,c.stream]);
 }
 await db.exec(readFileSync(resolve('scripts/internal-projects/accepted-personnel-transport.sql'),'utf8'));
 await db.exec(readFileSync(resolve('scripts/internal-projects/accepted-personnel-caller.sql'),'utf8'));
 await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch,enabled) values($1,$2,$3,$4,true)',[org,c.worker,c.issuer,v2epoch]);
 if(bootstrap){
  await db.exec(readFileSync(resolve('scripts/internal-projects/accepted-personnel-bootstrap.sql'),'utf8'));
  const args=[org,c.worker,'2026-10-02',c.issuer,v2epoch];
  const before=(await db.query('select count(*)::int n from operations_personnel_cost_publications')).rows[0].n;
  const boot=(await db.query('select operations_economy_private.bootstrap_personnel_day_v1($1,$2,$3,$4,$5) r',args)).rows[0].r;
  assert.equal(boot.current_revision,0);assert.equal(boot.source_stream_id,stream);
  assert.equal((await db.query('select count(*)::int n from operations_personnel_cost_publications')).rows[0].n,before);
  assert.equal((await db.query('select count(*)::int n from operations_economy_private.personnel_accepted_issuances_v1 m join operations_personnel_cost_outbox o on o.id=m.outbox_id where o.source_time_stream_id=$1',[stream])).rows[0].n,0);
  console.log('FIRST DAY PASS actual owner bootstrap creates only empty head/floor0, no source publication or accepted marker');
 }
 const call=await prepareCaller(c);
 let revision=bootstrap?0:1,version=bootstrap?0:1;
 const issue=async selected=>{
  let hour=8;
  const blocks=selected.map(p=>{const start=hour;hour+=p.minutes/60;return{id:p.id,kind:'work',durationMinutes:p.minutes,startsAt:`2026-10-02T${String(start).padStart(2,'0')}:00:00Z`,endsAt:`2026-10-02T${String(hour).padStart(2,'0')}:00:00Z`,target:{sourceSystem:'planning',kind:'project',externalId:p.project,version:'binding-v1'},requiresTargetConfirmation:true}});
  const raw=await fixture({workDate:'2026-10-02',version:++version,blocks,attestation:{confirmedByWorker:true,targetKeys:blocks.map(b=>[b.target.sourceSystem,b.target.kind,b.target.externalId,b.target.version].join(':'))}});
  const issued=await call(raw);
  const record=(await db.query('select * from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=$1',[issued.outbox_id])).rows[0];
  revision++;assert.equal(JSON.parse(record.raw_envelope).source_revision,revision);return record;
 };
 return{parts,issue,caller:call,stream,booking,internal,customer,activity,first:()=>issue(parts),correction:()=>issue([{...parts[0],minutes:240},{...parts[1],minutes:120}]),empty:()=>issue([])};
}
