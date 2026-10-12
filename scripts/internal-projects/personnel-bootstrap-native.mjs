import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {installBootstrap} from './personnel-bootstrap-fixture.mjs';
const require=createRequire(import.meta.url);
export async function proveBootstrapOverlap(c){
 const {db,org,worker,issuer,v2epoch,pass}=c;await installBootstrap(c);
 const {Client}=require('pg');const clients=await Promise.all(['bootstrap-owner','bootstrap-peer','bootstrap-observer'].map(async application_name=>{const p=new Client({connectionString:process.env.INTERNAL_PROJECTS_TEST_DSN,application_name,statement_timeout:12000,query_timeout:15000});await p.connect();return p;}));
 const [a,b,o]=clients;const ap=Number((await a.query('select pg_backend_pid() p')).rows[0].p),bp=Number((await b.query('select pg_backend_pid() p')).rows[0].p);
 const blocked=async(w,h)=>{for(let n=0;n<150;n++){if((await o.query('select $2::int=any(pg_blocking_pids($1::int)) ok',[w,h])).rows[0].ok)return;await new Promise(r=>setTimeout(r,20));}assert.fail('expected physical bootstrap lock overlap');};
 const boot=(p,date)=>p.query('select operations_economy_private.bootstrap_personnel_day_v1($1,$2,$3,$4,$5) r',[org,worker,date,issuer,v2epoch]);
 const binding=(await db.query('select * from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,worker])).rows[0];
 const stream=date=>`time:${binding.time_organization_id}:${binding.time_personnel_id}:${date}`;
 const count=async date=>Number((await o.query('select count(*) n from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream(date)])).rows[0].n);
 try{
  // Writer transaction already owns the shared fence. Bootstrap must wait BEFORE
  // head creation and cannot expose a half initialized enrollment to another peer.
  await a.query('begin');await a.query('set local role service_role');await a.query("insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) values($1,$2,$3,'2026-12-01',$4,$5)",[org,'bootstrap-unrelated-writer:'+randomUUID(),randomUUID(),binding.time_organization_id,randomUUID()]);await b.query('begin');const pending=boot(b,'2026-12-01');pending.catch(()=>{});await blocked(bp,ap);assert.equal(await count('2026-12-01'),0);await a.query('commit');assert.equal((await pending).rows[0].r.status,'initialized');assert.equal(await count('2026-12-01'),0);await b.query('commit');assert.equal(await count('2026-12-01'),1);
  pass('native bootstrap waits behind writer shared fence before inserting head; head and enrollment become visible only at commit');
  // Bootstrap first: generic service DML physically waits, then existing accepted
  // ownership rejects it, rather than creating an alternate unissued day.
  await a.query('begin');await boot(a,'2026-12-02');await b.query('begin');await b.query('set local role service_role');
  const write=b.query('insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) values($1,$2,$3,$4,$5,$6)',[org,stream('2026-12-03'),worker,'2026-12-03',binding.time_organization_id,binding.time_auth_worker_id]);write.catch(()=>{});await blocked(bp,ap);await a.query('commit');await assert.rejects(write,/accepted_worker_requires_verified_issuer/);await b.query('rollback');assert.equal(await count('2026-12-03'),0);
  pass('native owner bootstrap first fences generic direct writer until commit, then accepted identity denies shadow day');
  await a.query('begin');assert.equal((await boot(a,'2026-12-04')).rows[0].r.status,'initialized');await b.query('begin');const retry=boot(b,'2026-12-04');retry.catch(()=>{});await blocked(bp,ap);await a.query('commit');assert.equal((await retry).rows[0].r.status,'existing');await b.query('commit');assert.equal(await count('2026-12-04'),1);
  pass('native simultaneous owner retries serialize to one empty canonical head and one immutable floor');
 }finally{await Promise.allSettled(clients.map(async p=>{await p.query('rollback');await p.end();}));}
}
