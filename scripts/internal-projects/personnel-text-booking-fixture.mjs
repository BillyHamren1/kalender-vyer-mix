import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function proveTextBooking({db,read,as,org,worker,stream,issuer,epoch,next,lastAcceptedRevision,makeIssuerRequest,engine,fixture,ctx,pass}) {
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 const booking='\ufeff Bokning-Å/2026 🧰 ', customer='77777777-7777-4777-8777-777777777777',activity='abababab-abab-4bab-8bab-abababababab';
 await db.query('insert into bookings(id,organization_id,is_internal) values($1,$2,false)',[booking,org]);
 await db.query("update projects set project_kind='customer',booking_id=$2 where id=$1",[customer,booking]);
 await db.query("insert into projects(id,organization_id,project_kind,is_internal) values($1,$2,'internal_activity',false)",[activity,org]);
 const internalTarget=next.raw_time_snapshot.blocks[0].target;
 const customerTarget={...internalTarget,externalId:customer}, activityTarget={...internalTarget,externalId:activity};
 for(const [project,target,book] of [[customer,customerTarget,booking],[activity,activityTarget,null]])await db.query('insert into operations_personnel_target_bindings values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[org,target.sourceSystem,target.kind,target.externalId,target.version,project,book,'SEK','synthetic TEXT transport fixture']);
 const blocks=[next.raw_time_snapshot.blocks[0],{...next.raw_time_snapshot.blocks[0],id:'line-customer',durationMinutes:180,startsAt:'2026-10-01T10:00:00Z',endsAt:'2026-10-01T13:00:00Z',target:customerTarget},{...next.raw_time_snapshot.blocks[0],id:'line-activity',kind:'travel',durationMinutes:60,startsAt:'2026-10-01T13:00:00Z',endsAt:'2026-10-01T14:00:00Z',target:activityTarget}];
 const targetKeys=blocks.map(b=>[b.target.sourceSystem,b.target.kind,b.target.externalId,b.target.version].join(':'));
 const raw=await fixture({version:3,blocks,attestation:{confirmedByWorker:true,targetKeys}});
 const allocations=[{...ctx.allocations[0],source_booking_id:null},{...ctx.allocations[0],source_time_line_id:'line-customer',source_project_id:customer,source_booking_id:booking,target:customerTarget},{...ctx.allocations[0],source_time_line_id:'line-activity',source_project_id:activity,source_booking_id:null,target:activityTarget}];
 const calculation={...ctx,source_revision:lastAcceptedRevision+1,allocations};
 const snapshot=await engine.calculatePersonnelCostSnapshot(raw,calculation);
 assert.equal(snapshot.lines.length,3);assert.equal(snapshot.lines.find(l=>l.source_project_id===customer).source_booking_id,booking);
 const missing=snapshot.lines.find(l=>l.source_project_id===activity);assert.equal(missing.coverage,'missing_rate');assert.equal(missing.amount_minor,null);
 for(const opaque of ['66666666-6666-4666-8666-666666666666','a'.repeat(256),'å'.repeat(128),' BOM \ufeff ',booking]) {
  const values=structuredClone(allocations);values[1].source_booking_id=opaque;
  const value=await engine.calculatePersonnelCostSnapshot(raw,{...calculation,allocations:values});assert.equal(value.lines.find(l=>l.source_project_id===customer).source_booking_id,opaque);
  await db.query("insert into operations_personnel_target_bindings values($1,'planning','project',$2::text,$3,$2::uuid,$4,'SEK','opaque identity compatibility')",[org,customer,'text-'+createHash('sha256').update(opaque).digest('hex'),opaque]);
 }
 for(const bad of ['', 'a'.repeat(257),'å'.repeat(129),'bad\0id',77,{}]) {
  const values=structuredClone(allocations);values[1].source_booking_id=bad;
  await assert.rejects(engine.calculatePersonnelCostSnapshot(raw,{...calculation,allocations:values}),/invalid_allocation/);
 }
 for(const bad of ['', 'a'.repeat(257),'å'.repeat(129)])await assert.rejects(db.query("insert into operations_personnel_target_bindings values($1,'planning','project',$2::text,$3,$2::uuid,$4,'SEK','invalid identity compatibility')",[org,customer,'bad-'+createHash('sha256').update(bad).digest('hex'),bad]),/personnel_target_booking_transport_bytes/);
 pass('Booking opaque TEXT including Unicode/BOM/edge whitespace and UUID is exact; shared 256 UTF8-byte cap rejects overflow');
 const rawText=JSON.stringify(raw),evidence={...next.source_evidence,raw_snapshot:rawText,raw_snapshot_sha256:createHash('sha256').update(rawText).digest('hex'),submission_decision_sequence:3};
 const command={...next,expected_revision:lastAcceptedRevision,idempotency_key:'text-booking-mixed-source',snapshot,raw_time_snapshot:raw,source_evidence:evidence};
 const issue=async c=>{const r=makeIssuerRequest(c);return(await db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[r.body,r.timestamp,r.nonce,r.signature])).rows[0].r;};
 const badBooking=structuredClone(command);badBooking.snapshot.lines.find(l=>l.source_project_id===customer).source_booking_id='other-booking';await assert.rejects(issue(badBooking),/allocation_binding_mismatch/);
 const badTenant=structuredClone(command);badTenant.snapshot.organization_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';await assert.rejects(issue(badTenant),/issuer_source_mismatch/);
 const badRate=structuredClone(command);badRate.snapshot.lines.find(l=>l.source_project_id===customer).rate_revision='unreviewed';await assert.rejects(issue(badRate),/accepted_rate_provenance_required/);
 const omitted=structuredClone(command);omitted.snapshot.lines=omitted.snapshot.lines.filter(l=>l.source_project_id!==activity);await assert.rejects(issue(omitted),/incomplete_frozen_allocations/);
 const accepted=await issue(command);assert.equal(accepted.status,'accepted');
 const stored=(await db.query('select raw_body::jsonb body from operations_personnel_cost_outbox where id=$1',[accepted.outbox_id])).rows[0].body;
 assert.equal(stored.lines.length,3);assert.equal(stored.lines.find(l=>l.source_project_id===customer).source_booking_id,booking);assert.equal(stored.lines.find(l=>l.source_project_id===activity).coverage,'missing_rate');
 assert.equal((await issue(command)).status,'duplicate');
 pass('actual calculator to signed issuer to guarded canonical SQL preserves full mixed customer/internal/activity membership and exact TEXT booking');
 const voided={...command,expected_revision:lastAcceptedRevision+1,idempotency_key:'text-booking-voided-source',snapshot:{...snapshot,source_revision:lastAcceptedRevision+2},source_evidence:{...evidence,submission_state:'voided',submission_decision_sequence:4}};
 const rejected=await issue(voided);const rejectedBody=(await db.query('select raw_body::jsonb body from operations_personnel_cost_outbox where id=$1',[rejected.outbox_id])).rows[0].body;
 assert.equal(rejectedBody.lines.length,3);assert.ok(rejectedBody.lines.every(l=>l.status==='rejected'));assert.equal(rejectedBody.lines.find(l=>l.source_project_id===customer).source_booking_id,booking);
 const emptyRaw=await fixture({version:4,blocks:[],attestation:{confirmedByWorker:true,targetKeys:[]}});
 const empty=await engine.calculatePersonnelCostSnapshot(emptyRaw,{...calculation,source_revision:lastAcceptedRevision+3,allocations:[]});
 const emptyText=JSON.stringify(emptyRaw);
 const corrected={...command,expected_revision:lastAcceptedRevision+2,idempotency_key:'text-booking-empty-correction',snapshot:empty,raw_time_snapshot:emptyRaw,source_evidence:{...evidence,raw_snapshot:emptyText,raw_snapshot_sha256:createHash('sha256').update(emptyText).digest('hex'),submission_state:'submitted',submission_decision_sequence:0}};
 const withdrawn=await issue(corrected);assert.equal(withdrawn.status,'accepted');const current=(await db.query('select cost_snapshot from operations_personnel_cost_current where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].cost_snapshot;
 assert.deepEqual(current.lines,[]);assert.equal(current.time_snapshot_version,4);assert.notEqual(current.source_time_report_id,snapshot.source_time_report_id);
 const old=(await db.query('select raw_body::jsonb body from operations_personnel_cost_outbox where id=$1',[accepted.outbox_id])).rows[0].body;assert.deepEqual(old,stored);
 pass('voided full stream retains rejected/missing-rate lines; new immutable empty correction replaces current membership without rewriting prior evidence');
}
