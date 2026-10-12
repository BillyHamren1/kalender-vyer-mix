import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {prepareCallerClaimStreams} from './personnel-caller-fixture.mjs';
const require=createRequire(import.meta.url);
export async function provePersonnelOwnershipOverlap(context){
 const {db,read,org,worker,issuer,v2epoch,pass}=context;
 // The sequential hook was rolled back. Install committed candidate only after
 // ALL original baseline assertions; native peers must see real trigger/function OIDs.
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-caller.sql'));
 const {Client}=require('pg');
 const clients=await Promise.all(['caller-first','caller-second','caller-observer'].map(async application_name=>{const c=new Client({connectionString:process.env.INTERNAL_PROJECTS_TEST_DSN,application_name,statement_timeout:12000,query_timeout:15000});await c.connect();return c;}));
 const [a,b,o]=clients;const pid=async c=>Number((await c.query('select pg_backend_pid() pid')).rows[0].pid),ap=await pid(a),bp=await pid(b);
 const blocked=async(waiter,holder)=>{for(let n=0;n<150;n++){if((await o.query('select $2::int=any(pg_blocking_pids($1::int)) ok',[waiter,holder])).rows[0].ok)return;await new Promise(r=>setTimeout(r,20));}assert.fail('expected physical ownership advisory lock overlap');};
 const identity=async()=>{const w=randomUUID(),auth=randomUUID(),person=randomUUID();await db.query('insert into operations_personnel_source_bindings select organization_id,$3,time_organization_id,$4,$5,time_source_system,$3::uuid::text,true from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,worker,w,auth,person]);return {w,auth,stream:'time:fixture:'+person};};
 const insert=async(c,id,offset=0)=>c.query("insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) select $1,$2,$3,date '2026-11-01'+$4::integer,time_organization_id,time_auth_worker_id from operations_personnel_source_bindings where organization_id=$1 and worker_id=$3",[org,id.stream+':'+offset,id.w,offset]);
 const enroll=(c,id)=>c.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch) values($1,$2,$3,$4)',[org,id.w,issuer,v2epoch]);
 try{
  // Writer linearizes first: ownership setup waits until the complete transaction commits.
  const first=await identity();await a.query('begin');await a.query('set local role service_role');await insert(a,first);
  const en=b.query('begin').then(()=>enroll(b,first));en.catch(()=>{});await blocked(bp,ap);await a.query('commit');await en;await b.query('commit');
  await a.query('begin');await a.query('set local role service_role');await assert.rejects(insert(a,first,1),/accepted_worker_requires_verified_issuer/);await a.query('rollback');
  assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_streams where organization_id=$1 and worker_id=$2',[org,first.w])).rows[0].n),1);
  pass('native first-day direct writer wins; enrollment physically waits through commit, later day write denied');
  // Enrollment linearizes first even though the worker has no canonical day row.
  const second=await identity();await a.query('begin');await enroll(a,second);await b.query('begin');await b.query('set local role service_role');
  const attempted=insert(b,second);attempted.catch(()=>{});await blocked(bp,ap);await a.query('commit');await assert.rejects(attempted,/accepted_worker_requires_verified_issuer/);await b.query('rollback');
  assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_streams where organization_id=$1 and worker_id=$2',[org,second.w])).rows[0].n),0);
  pass('native absent-first-day enrollment wins; waiting legacy INSERT rechecks committed policy and writes zero rows');
  // Shared ownership locks must not serialize ordinary unrelated writers; bulk
  // statement order cannot acquire conflicting per-worker ownership locks.
  const third=await identity(),fourth=await identity();await a.query('begin');await a.query('set local role service_role');await insert(a,third);
  await b.query('begin');await b.query('set local role service_role');await insert(b,fourth);
  await b.query("insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) select organization_id,$3||':'||n,worker_id,date '2026-11-01'+n,time_organization_id,time_auth_worker_id from operations_personnel_source_bindings cross join generate_series(1,3)n where organization_id=$1 and worker_id=$2",[org,fourth.w,fourth.stream]);
  assert.equal((await o.query('select cardinality(pg_blocking_pids($1::int)) n',[bp])).rows[0].n,0);await b.query('commit');await a.query('commit');
  assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_streams where organization_id=$1 and worker_id=$2',[org,fourth.w])).rows[0].n),4);
  pass('native two ordinary writer transactions overlap; bulk multi-day insertion preserves shared ownership fence');
  await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch,enabled) values($1,$2,$3,$4,true)',[org,worker,issuer,v2epoch]);
  await db.query("insert into operations_economy_private.personnel_accepted_routes_v1 values($1,$2,'https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive',convert_to('native-caller-distinct-delivery-secret','UTF8'),true)",[issuer,v2epoch]);
  const ids=await prepareCallerClaimStreams(context),ordered=(await db.query('select id from operations_personnel_cost_outbox where id=any($1::uuid[]) order by created_at,source_revision,id',[ids])).rows.map(r=>r.id);
  await a.query('begin');await a.query('select id from operations_personnel_cost_outbox where id=$1 for update',[ordered[0]]);
  const leased=(await b.query("select operations_economy_private.claim_accepted_personnel_scoped_v1($1,$2,'parallel-second-stream',1,60) c",[issuer,v2epoch])).rows;
  assert.equal(leased.length,1);assert.equal(leased[0].c.id,ordered[1]);assert.equal(Number((await db.query('select attempts from operations_personnel_cost_outbox where id=$1',[ordered[0]])).rows[0].attempts),0);await a.query('commit');
  pass('native scoped claim skips locked first stream and leases another actual issued stream before first holder commits');

 }finally{await Promise.allSettled(clients.map(c=>c.query('rollback')));await Promise.all(clients.map(c=>c.end()));}
}
