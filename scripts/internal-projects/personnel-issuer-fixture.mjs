import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
export async function provePersonnelIssuer({db,read,as,org,worker,raw,snapshot,evidence,pass,fixture,engine,ctx,afterIssuer}){
 await db.exec(read('scripts/internal-projects/accepted-personnel-issuer.sql'));
 const issuer='dddddddd-dddd-4ddd-8ddd-dddddddddddd',epoch='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',secret='disposable-issuer-key-not-a-production-secret',stream=snapshot.source_time_stream_id;
 const binding=(await db.query('select to_jsonb(b) b from operations_personnel_source_bindings b where organization_id=$1 and worker_id=$2',[org,worker])).rows[0].b;
 const route=(await db.query('select * from operations_personnel_transport_routes where organization_id=$1',[org])).rows[0];
 const head=Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r);
 let command={schema:'operations-personnel-issuer-command.v1',issuer_id:issuer,enrollment_epoch:epoch,organization_id:org,destination_organization_id:route.destination_organization_id,source_stream_id:stream,expected_revision:head,idempotency_key:'prospective-issuer-fixture',snapshot:{...snapshot,source_revision:head+1},raw_time_snapshot:raw,source_evidence:{...evidence,submission_decision_sequence:1}};
 const request=(c=command,extra={})=>{const body=JSON.stringify(c),timestamp=Math.floor(Date.now()/1000),nonce=randomUUID();return {...{body,timestamp,nonce,signature:createHmac('sha256',secret).update(['operations-personnel-source-attestation.v1',timestamp,nonce,body].join('\n')).digest('hex')},...extra}};
 const issue=r=>db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[r.body,r.timestamp,r.nonce,r.signature]);
 await assert.rejects(issue(request()),/issuer_not_enrolled/);pass('issuer absent by default');
 await db.query("insert into operations_economy_private.personnel_issuers_v1 values($1,$2,$3,$4,convert_to($5,'UTF8'),false)",[issuer,epoch,org,route.destination_organization_id,secret]);
 await assert.rejects(issue(request()),/issuer_not_enrolled/);
 await db.query('update operations_economy_private.personnel_issuers_v1 set enabled=true where issuer_id=$1',[issuer]);
 await assert.rejects(issue(request()),/issuer_stream_below_floor_or_absent/);
 await db.query('insert into operations_economy_private.personnel_issuer_streams_v1 values($1,$2,$3,$4,$5)',[issuer,epoch,stream,head,binding]);
 pass('issuer disabled and absent explicit stream both fail');
 for(const role of ['service_role','authenticated','anon']){
  await assert.rejects(as(role,()=>db.query('select * from operations_economy_private.personnel_issuers_v1')),/permission denied/);
  await assert.rejects(as(role,()=>issue(request())),/permission denied/);
 }pass('generic service cannot read keys or invoke dormant issuer port');
 const bad=request();await assert.rejects(issue({...bad,body:bad.body.replace('prospective-issuer-fixture','tampered-issuer-fixture')}),/invalid_issuer_signature/);
 await assert.rejects(issue({...bad,signature:'0'.repeat(64)}),/invalid_issuer_signature/);
 await assert.rejects(issue({...bad,timestamp:bad.timestamp-120}),/invalid_issuer_attempt/);
 await assert.rejects(issue(request({...command,enrollment_epoch:randomUUID()})),/issuer_not_enrolled/);
 pass('issuer signature binds exact body, expiry and enrollment epoch');
 await assert.rejects(issue(request({...command,expected_revision:head-1,snapshot:{...snapshot,source_revision:head}})),/below_floor/);
 await db.query('update operations_personnel_source_bindings set enabled=false where organization_id=$1',[org]);
 await assert.rejects(issue(request()),/issuer_source_binding_changed/);
 await db.query('update operations_personnel_source_bindings set enabled=true where organization_id=$1',[org]);
 pass('floor and current source authority checked before issuance');
 await assert.rejects(issue(request()),/unissued_same_version_ancestor/);pass('fresh signed same-version shadow review cannot establish accepted ancestry');
 const newRaw=await fixture({version:2}),newSnapshot=await engine.calculatePersonnelCostSnapshot(newRaw,{...ctx,source_revision:head+1});
 const rawText=JSON.stringify(newRaw); // hash is exact raw UTF-8, not JSON reserialization
 const {createHash}=await import('node:crypto');
 const newEvidence={...evidence,raw_snapshot:rawText,raw_snapshot_sha256:createHash('sha256').update(rawText).digest('hex'),submission_decision_sequence:1};
 command={...command,snapshot:newSnapshot,raw_time_snapshot:newRaw,source_evidence:newEvidence};
 const good=request();const first=(await issue(good)).rows[0].r;assert.equal(first.status,'accepted');
 const marker=(await db.query('select * from operations_economy_private.personnel_accepted_issuances_v1')).rows[0];const envelope=JSON.parse(marker.raw_envelope);
 assert.equal(envelope.membership,'full_stream');assert.equal(envelope.source_revision,head+1);assert.equal(envelope.outbox_id,first.outbox_id);
 assert.deepEqual(envelope.snapshot,(await db.query('select raw_body::jsonb s from operations_personnel_cost_outbox where id=$1',[first.outbox_id])).rows[0].s);
 const retry=(await issue(good)).rows[0].r;assert.equal(retry.status,'duplicate');assert.equal(retry.fingerprint,first.fingerprint);assert.equal(retry.occurred_at,first.occurred_at);
 pass('fresh issuer atomically references canonical publication and exact retry keeps frozen envelope');
 await db.query('update operations_personnel_transport_routes set destination_organization_id=$1 where organization_id=$2',[randomUUID(),org]);
 await assert.rejects(issue(good),/issuer_destination_changed/);
 await db.query('update operations_personnel_transport_routes set destination_organization_id=$1 where organization_id=$2',[route.destination_organization_id,org]);
 pass('changed destination authority denies even an exact issued retry');
 await assert.rejects(issue(request({...command,idempotency_key:'different-command-same-nonce'},{nonce:good.nonce,signature:createHmac('sha256',secret).update(['operations-personnel-source-attestation.v1',good.timestamp,good.nonce,JSON.stringify({...command,idempotency_key:'different-command-same-nonce'})].join('\n')).digest('hex'),timestamp:good.timestamp})),/issuer_nonce_conflict/);
 pass('nonce cannot authorize changed command');
 await db.query('update operations_economy_private.personnel_issuers_v1 set enabled=false where issuer_id=$1',[issuer]);
 await assert.rejects(issue(good),/issuer_not_enrolled/);pass('issuer revocation denies duplicate command before receipt');
 await db.query('update operations_economy_private.personnel_issuers_v1 set enabled=true where issuer_id=$1',[issuer]);
 // Retry an existing shadow command under a separately enrolled floor zero. Even
 // a valid issuer signature cannot retroactively manufacture its marker.
 const epoch2=randomUUID();await db.query("insert into operations_economy_private.personnel_issuers_v1 values($1,$2,$3,$4,convert_to($5,'UTF8'),true)",[issuer,epoch2,org,route.destination_organization_id,secret]);
 await db.query('insert into operations_economy_private.personnel_issuer_streams_v1 values($1,$2,$3,0,$4)',[issuer,epoch2,stream,binding]);
 await assert.rejects(issue(request({...command,enrollment_epoch:epoch2,expected_revision:0,idempotency_key:'rate-provenance-initial',snapshot,raw_time_snapshot:raw,source_evidence:evidence})),/legacy_shadow_publication_not_issued/);
 await assert.rejects(issue(request({...command,enrollment_epoch:epoch2,expected_revision:head+1,idempotency_key:'cross-epoch-ancestry',snapshot:{...newSnapshot,source_revision:head+2},source_evidence:{...newEvidence,submission_decision_sequence:2}})),/unissued_same_version_ancestor/);
 assert.equal(Number((await db.query('select count(*) n from operations_economy_private.personnel_accepted_issuances_v1')).rows[0].n),1);
 pass('signed old shadow retry cannot mint accepted marker');
 // Inject a marker-write failure into this isolated fixture, prove all canonical
 // writes and nonce consumption roll back with it. No production table touched.
 await db.exec("create function operations_economy_private.issuer_fixture_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic_marker_fault';end$$;create trigger issuer_fixture_fault before insert on operations_economy_private.personnel_accepted_issuances_v1 for each row execute function operations_economy_private.issuer_fixture_fault()");
 const next={...command,expected_revision:head+1,idempotency_key:'issuer-fixture-atomic-fault',snapshot:{...newSnapshot,source_revision:head+2},source_evidence:{...newEvidence,submission_decision_sequence:2}};
 const faultAttempt=request(next);await assert.rejects(issue(faultAttempt),/synthetic_marker_fault/);
 assert.equal(Number((await db.query('select count(*) n from operations_economy_private.personnel_issuer_nonces_v1 where nonce=$1',[faultAttempt.nonce])).rows[0].n),0);
 assert.equal(Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r),head+1);
 assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_outbox where organization_id=$1 and source_time_stream_id=$2 and source_revision=$3',[org,stream,head+2])).rows[0].n),0);
 await db.exec('drop trigger issuer_fixture_fault on operations_economy_private.personnel_accepted_issuances_v1');
 assert.equal((await issue(faultAttempt)).rows[0].r.status,'accepted');
 pass('marker failure rolls back publication, outbox, head and nonce; identical retry succeeds');
 if(afterIssuer)await afterIssuer({db,read,as,org,worker,stream,issuer,epoch,epoch2,route,command,next,head,lastAcceptedRevision:next.snapshot.source_revision,makeIssuerRequest:request,pass,fixture,engine,ctx});
}
