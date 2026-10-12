import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function installBootstrap(c){
 const {db,read,org,worker,issuer,v2epoch}=c;
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-caller.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-bootstrap.sql'));
 await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch,enabled) values($1,$2,$3,$4,true)',[org,worker,issuer,v2epoch]);
}
export async function proveBootstrap(c){
 const {db,org,worker,issuer,v2epoch,pass}=c;await installBootstrap(c);
 const call=(date,over=[])=>db.query('select operations_economy_private.bootstrap_personnel_day_v1($1,$2,$3,$4,$5) r',over.length?over:[org,worker,date,issuer,v2epoch]);
 const denied=async(fn,re)=>{await db.exec('savepoint bootstrap_negative');try{await assert.rejects(fn,re);}finally{await db.exec('rollback to bootstrap_negative');}};
 const b=(await db.query('select * from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,worker])).rows[0];
 for(const date of ['0001-01-01','2026-12-24','9999-12-31']){
  const r=(await call(date)).rows[0].r;assert.equal(r.status,'initialized');assert.equal(r.source_stream_id,`time:${b.time_organization_id}:${b.time_personnel_id}:${date}`);assert.equal(r.current_revision,0);assert.equal(r.revision_floor,0);
  assert.equal((await call(date)).rows[0].r.status,'existing');
  assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_publications where source_time_stream_id=$1',[r.source_stream_id])).rows[0].n),0);
 }
 pass('owner bootstrap derives exact civil-day identity and atomically enrolls empty revision zero, exact retry at date boundaries');
 for(const date of ['infinity','-infinity','10000-01-01'])await denied(()=>call(date),/invalid_personnel_bootstrap_identity/);
 await denied(()=>call(null),/invalid_personnel_bootstrap_identity/);
 await denied(()=>call('2026-12-25',[org,randomUUID(),'2026-12-25',issuer,v2epoch]),/bootstrap_worker_not_enabled/);
 await denied(()=>call('2026-12-25',[org,worker,'2026-12-25',issuer,randomUUID()]),/bootstrap_issuer_not_enabled/);
 pass('invalid civil dates and caller-supplied foreign identity fail before any head insertion');
 for(const mutation of ["update operations_economy_private.personnel_accepted_workers_v1 set enabled=false","update operations_economy_private.personnel_issuers_v1 set enabled=false","update operations_personnel_source_bindings set enabled=false","update operations_personnel_source_bindings set time_auth_worker_id='abababab-abab-4bab-8bab-abababababab'"]){
  await db.exec('savepoint bootstrap_revoked');await db.exec(mutation);await denied(()=>call('2026-12-25'),/bootstrap_(worker_not_enabled|issuer_not_enabled|source_binding_changed)/);await db.exec('rollback to bootstrap_revoked');
 }
 pass('disabled issuer or worker and disabled/rebound authenticated Time source all deny bootstrap');
 const st=`time:${b.time_organization_id}:${b.time_personnel_id}:2026-12-24`;
 await db.exec('savepoint bootstrap_nonzero');await db.query('update operations_personnel_cost_streams set current_revision=1 where organization_id=$1 and source_time_stream_id=$2',[org,st]);await denied(()=>call('2026-12-24'),/bootstrap_stream_not_empty/);await db.exec('rollback to bootstrap_nonzero');
 await db.exec('savepoint bootstrap_alias');await db.query("insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) values($1,'legacy-alias',$2,'2026-12-26',$3,$4)",[org,worker,b.time_organization_id,b.time_auth_worker_id]);await denied(()=>call('2026-12-26'),/bootstrap_worker_day_conflict/);await db.exec('rollback to bootstrap_alias');
 pass('nonzero history and conflicting worker-day aliases cannot be promoted or renamed');
 await db.exec('savepoint bootstrap_fault');
 await db.exec("create function operations_economy_private.bootstrap_test_fault() returns trigger language plpgsql as $$begin raise exception 'bootstrap_fault';end;$$; create trigger bootstrap_test_fault before insert on operations_economy_private.personnel_issuer_streams_v1 for each row execute function operations_economy_private.bootstrap_test_fault()");
 await denied(()=>call('2026-12-27'),/bootstrap_fault/);
 assert.equal(Number((await db.query("select count(*) n from operations_personnel_cost_streams where organization_id=$1 and worker_id=$2 and work_date='2026-12-27'",[org,worker])).rows[0].n),0);await db.exec('rollback to bootstrap_fault');
 pass('enrollment failure rolls back newly inserted head atomically');
 await db.exec('savepoint bootstrap_history');
 // Deliberately inconsistent owner-only negative fixture: copy a constrained
 // canonical publication into the correctly derived zero-head stream. No accepted
 // marker is fabricated; the bootstrap must reject this historical evidence.
 await db.query("insert into operations_personnel_cost_publications select (jsonb_populate_record(null::operations_personnel_cost_publications,to_jsonb(p)||jsonb_build_object('source_time_stream_id',$3::text,'idempotency_key','bootstrap-history-negative'))).* from operations_personnel_cost_publications p where organization_id=$1 and source_time_stream_id=$2 order by source_revision limit 1",[org,c.stream,st]);
 assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_publications where organization_id=$1 and source_time_stream_id=$2',[org,st])).rows[0].n),1);
 await denied(()=>call('2026-12-24'),/bootstrap_canonical_evidence_exists/);await db.exec('rollback to bootstrap_history');
 pass('zero head with constrained historical publication cannot be promoted into prospective floor zero');
 const oid=(await db.query("select 'operations_economy_private.bootstrap_personnel_day_v1(uuid,uuid,date,uuid,uuid)'::regprocedure::oid oid")).rows[0].oid;
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2::oid,'EXECUTE') a",[role,oid])).rows[0].a,false);
 pass('bootstrap remains owner-only with no public or service execution grant');
}
