import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
export async function proveReviewCallerNative(c){
 const {db,read,org,worker,issuer,v2epoch,stream,pass}=c,project=c.command.snapshot.lines[0].source_project_id,admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 // Original fixture already proved revocation. Provision a new disposable test
 // role for these independent API actor scenarios; never change real accounts.
 await db.query("insert into user_roles(user_id,organization_id,role) values($1,$2,'admin')",[admin,org]);
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-caller.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-review-caller.sql'));
 await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch,enabled) values($1,$2,$3,$4,true)',[org,worker,issuer,v2epoch]);
 const {Client}=require('pg'),clients=await Promise.all(['review-a','review-b','review-watch'].map(async application_name=>{const x=new Client({connectionString:process.env.INTERNAL_PROJECTS_TEST_DSN,application_name,statement_timeout:10000});await x.connect();await x.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);return x;}));const[a,b,o]=clients;
 const ap=Number((await a.query('select pg_backend_pid() id')).rows[0].id),bp=Number((await b.query('select pg_backend_pid() id')).rows[0].id);
 const block=async(waiter,holder)=>{for(let n=0;n<150;n++){if((await o.query('select $2::int=any(pg_blocking_pids($1::int)) ok',[waiter,holder])).rows[0].ok)return;await new Promise(r=>setTimeout(r,20));}assert.fail('physical review lock not observed');};
 const row=async()=>(await o.query('select get_operations_accepted_project_reviews_v1($1,null,50) r',[project])).rows[0].r.rows.find(r=>r.stream===stream);
 const call=async(x,r,key)=>(await x.query("select review_and_publish_operations_project_personnel_v1($1,$2,$3,$4,'approved',null,$5) r",[project,stream,r.source_revision,r.review_sequence,key])).rows[0].r;
 try{
  const r=await row(),key=randomUUID();await a.query('begin');assert.equal((await call(a,r,key)).status,'accepted');
  const later=b.query('begin').then(()=>call(b,r,key));later.catch(()=>{});await block(bp,ap);await a.query('commit');const replay=await later;assert.equal(replay.status,'duplicate');await b.query('commit');
  assert.equal(Number((await o.query("select count(*) n from operations_project_personnel_reviews where organization_id=$1 and idempotency_key=$2",[org,'accepted-review:event:'+key])).rows[0].n),1);
  pass('native same-command review waits for committed first transaction and returns one immutable duplicate');
  await a.query('begin');await a.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);
  const denied=b.query('begin').then(()=>call(b,r,key));denied.catch(()=>{});await block(bp,ap);await a.query('commit');await assert.rejects(denied,/accepted_review_unavailable/);await b.query('rollback');
  await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=true where organization_id=$1 and worker_id=$2',[org,worker]);
  pass('native ownership disable wins before exact review replay; waiter rechecks and denies');
  const newer=await row();await a.query('begin');await call(a,newer,randomUUID());await b.query('begin');const revoke=b.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);revoke.catch(()=>{});await block(bp,ap);await a.query('rollback');await revoke;await b.query('commit');
  await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=true where organization_id=$1 and worker_id=$2',[org,worker]);
  pass('native active review holds ownership fence until rollback; disable cannot pass mid-publication');
 }finally{await Promise.allSettled(clients.map(x=>x.query('rollback')));await Promise.all(clients.map(x=>x.end()));}
}
