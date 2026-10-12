import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
export async function proveAcceptedPersonnelTransport({db,read,as,org,stream,issuer,epoch,route,pass,next,makeIssuerRequest}){
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 const transportSecret='disposable-accepted-delivery-key-not-issuer-secret';
 const endpoint='https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive';
 const claim=(owner='transport-worker')=>db.query('select operations_economy_private.claim_accepted_personnel_v1($1,20,30) c',[owner]);
 assert.equal((await claim()).rows.length,0);
 await db.query("insert into operations_economy_private.personnel_accepted_routes_v1 values($1,$2,$3,convert_to($4,'UTF8'),false)",[issuer,epoch,endpoint,transportSecret]);
 assert.equal((await claim()).rows.length,0);pass('accepted delivery route absent/disabled yields no claims');
 const enrollmentEpoch=randomUUID();
 await db.query("insert into operations_economy_private.personnel_issuers_v1 values($1,$2,$3,$4,convert_to('disposable-floor-issuer-key-long-enough','UTF8'),false)",[issuer,enrollmentEpoch,org,route.destination_organization_id]);
 const enroll=(s=stream)=>db.query('select operations_economy_private.enroll_personnel_stream_v1($1,$2,$3) f',[issuer,enrollmentEpoch,s]);
 await assert.rejects(enroll('missing-stream'),/canonical_stream_missing/);
 const current=Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r);
 assert.equal(Number((await enroll()).rows[0].f),current);assert.equal(Number((await enroll()).rows[0].f),current);
 await assert.rejects(db.query('update operations_economy_private.personnel_issuer_streams_v1 set revision_floor=0 where enrollment_epoch=$1',[enrollmentEpoch]),/operations_personnel_evidence_is_append_only/);
 pass('atomic enrollment captures existing canonical head and immutable floor; missing stream denied');
 await db.query('update operations_economy_private.personnel_accepted_routes_v1 set enabled=true where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
 await db.query('update operations_economy_private.personnel_accepted_routes_v1 set secret=(select secret from operations_economy_private.personnel_issuers_v1 where issuer_id=$1 and enrollment_epoch=$2) where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
 assert.equal((await claim()).rows.length,0);
 await db.query("update operations_economy_private.personnel_accepted_routes_v1 set secret=convert_to($3,'UTF8') where issuer_id=$1 and enrollment_epoch=$2",[issuer,epoch,transportSecret]);
 pass('reusing attestation key for transport fails closed');
 await db.query('update operations_personnel_transport_routes set enabled=true where organization_id=$1',[org]);
 const shadow=(await as('service_role',()=>db.query("select id from claim_operations_personnel_cost_outbox_v1('shadow-worker',100,30)"))).rows;
 const acceptedIds=(await db.query('select outbox_id from operations_economy_private.personnel_accepted_issuances_v1')).rows.map(r=>r.outbox_id);
 assert.ok(shadow.length>0);assert.ok(shadow.every(r=>!acceptedIds.includes(r.id)));pass('existing shadow claimant excludes every accepted outbox identity');
 const firstClaims=(await claim()).rows;assert.equal(firstClaims.length,1);const first=firstClaims[0].c;
 for(const change of ["state='delivered'","receipt='{}'::jsonb","lease_token=gen_random_uuid()","accepted_lease_route_sha256=repeat('0',64)"]){
  await assert.rejects(as('service_role',()=>db.query('update operations_personnel_cost_outbox set '+change+' where id=$1',[first.id])),/accepted_delivery_owner_required/);
 }
 pass('BYPASSRLS service direct state, receipt, lease and route-context writes cannot bypass accepted finish');
 assert.equal((await claim('parallel-worker')).rows.length,0);pass('accepted head-of-line lease blocks later revision and competing claim');
 await assert.rejects(as('service_role',()=>db.query('select finish_operations_personnel_cost_outbox_v1($1,$2,$3,$4,null,null)',[first.id,first.lease_owner,first.lease_token,'retry'])),/accepted_outbox_cannot_use_shadow_finish/);
 pass('existing shadow finisher cannot mutate accepted lease');
 const ack=(c,extra={})=>{const raw_ack=JSON.stringify({schema:'operations-personnel-accepted-receipt.v1',outcome:'received',issuer_id:c.issuer_id,enrollment_epoch:c.enrollment_epoch,source_organization_id:c.organization_id,destination_organization_id:c.destination_organization_id,source_stream_id:c.source_time_stream_id,source_revision:c.source_revision,outbox_id:c.id,envelope_sha256:c.body_sha256,receipt_id:randomUUID(),financially_applied:false,...extra});return{raw_ack,signature:createHmac('sha256',transportSecret).update('operations-personnel-accepted-ack.v1\n'+raw_ack).digest('hex')}};
 const finish=(c,outcome='delivered',a=ack(c))=>db.query('select operations_economy_private.finish_accepted_personnel_v1($1,$2,$3,$4,$5,$6,$7) r',[c.id,c.lease_owner,c.lease_token,outcome,a?.raw_ack??null,a?.signature??null,outcome==='delivered'?null:'synthetic_timeout']);
 await assert.rejects(finish({...first,lease_token:randomUUID()}),/accepted_lease_not_owned/);
 await assert.rejects(finish(first,'delivered',{raw_ack:ack(first).raw_ack,signature:'0'.repeat(64)}),/accepted_ack_signature_invalid/);
 for(const change of [{outcome:null},{financially_applied:true},{enrollment_epoch:randomUUID()},{outbox_id:randomUUID()},{source_revision:first.source_revision+1},{envelope_sha256:'0'.repeat(64)},{receipt_id:null}])await assert.rejects(finish(first,'delivered',ack(first,change)),/accepted_ack_unbound/);
 pass('DB independently rejects false ACK signature, wrong lease and signed unbound/financial ACK fields');
 const genuine=ack(first);await db.query('update operations_economy_private.personnel_accepted_routes_v1 set enabled=false where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
 await assert.rejects(finish(first,'delivered',genuine),/accepted_route_not_enabled/);
 await db.query('update operations_economy_private.personnel_accepted_routes_v1 set enabled=true,endpoint_url=$3 where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch,'https://other.example.invalid/functions/v1/operations-personnel-accepted-receive']);
 await assert.rejects(finish(first,'delivered',genuine),/accepted_route_not_enabled/);
 await db.query('update operations_economy_private.personnel_accepted_routes_v1 set endpoint_url=$3 where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch,endpoint]);
 pass('revoked or changed current route cannot finish prior accepted lease');
 // Lost response: retry preserves the immutable accepted payload, but gets a new lease.
 assert.equal((await finish(first,'retry',null)).rows[0].r.status,'retry');
 await db.query("update operations_personnel_cost_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[first.id]);
 const retried=(await claim()).rows[0].c;assert.equal(retried.id,first.id);assert.equal(retried.raw_body,first.raw_body);assert.notEqual(retried.lease_token,first.lease_token);
 await assert.rejects(finish(first,'delivered',genuine),/accepted_lease_not_owned/);
 assert.equal((await finish(retried,'delivered',ack(retried,{outcome:'replayed'}))).rows[0].r.status,'delivered');
 pass('lost response retry keeps same immutable body and rejects previous lease ACK');
 const second=(await claim()).rows[0].c;assert.ok(second.source_revision>first.source_revision);
 await db.query("update operations_personnel_cost_outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1",[second.id]);
 await assert.rejects(finish(second),/accepted_lease_not_owned/);
 const reclaimed=(await claim('reclaimed-worker')).rows[0].c;assert.equal(reclaimed.id,second.id);assert.notEqual(reclaimed.lease_token,second.lease_token);
 assert.equal((await finish(reclaimed)).rows[0].r.status,'delivered');
 assert.equal((await claim()).rows.length,0);pass('next revision waits for evidence ACK and expired leases reclaim without duplicate identity');
 for(const role of ['service_role','authenticated','anon']){
  await assert.rejects(as(role,()=>db.query('select * from operations_economy_private.personnel_accepted_routes_v1')),/permission denied/);
  await assert.rejects(as(role,()=>claim()),/permission denied/);
 }
 pass('accepted mutation ports and delivery key remain inaccessible to generic roles');
 if(process.env.INTERNAL_PROJECTS_TEST_DSN){
  const {proveNativeAcceptedTransport}=await import('./personnel-accepted-native.mjs');
  await proveNativeAcceptedTransport({db,org,stream,issuer,epoch,route,pass,next,makeIssuerRequest,ack,finish,claim});
 }
}
