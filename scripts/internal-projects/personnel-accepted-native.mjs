// Actual PostgreSQL overlap evidence. Runs only inside the strict loopback fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
export async function proveNativeAcceptedTransport({db,org,stream,issuer,epoch,route,pass,next,makeIssuerRequest,ack,finish,claim}){
 const dsn=process.env.INTERNAL_PROJECTS_TEST_DSN,u=new URL(dsn);
 assert.ok(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/accepted_personnel_cost_ci'&&!u.search&&!u.hash);
 const a=new Client({connectionString:dsn,application_name:'accepted-native-a',statement_timeout:10000});
 const b=new Client({connectionString:dsn,application_name:'accepted-native-b',statement_timeout:10000});
 const observer=new Client({connectionString:dsn,application_name:'accepted-native-observer',statement_timeout:10000});
 await Promise.all([a.connect(),b.connect(),observer.connect()]);
 const waitForLock=async()=>{const end=Date.now()+5000;while(Date.now()<end){const r=await observer.query("select wait_event_type from pg_stat_activity where application_name='accepted-native-b' and datname=current_database()");if(r.rows.some(v=>v.wait_event_type==='Lock'))return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('No physical PostgreSQL lock wait observed');};
 try{
  const enrollEpoch=randomUUID();await db.query("insert into operations_economy_private.personnel_issuers_v1 values($1,$2,$3,$4,convert_to('native-enrollment-fixture-key-only','UTF8'),false)",[issuer,enrollEpoch,org,route.destination_organization_id]);
  const current=Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r);
  const c={...next,expected_revision:current,idempotency_key:'native-accepted-atomic-publication',snapshot:{...next.snapshot,source_revision:current+1},source_evidence:{...next.source_evidence,submission_decision_sequence:3}};
  const r=makeIssuerRequest(c);
  await a.query('begin');
  assert.equal((await a.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[r.body,r.timestamp,r.nonce,r.signature])).rows[0].r.status,'accepted');
  const enrollment=b.query('select operations_economy_private.enroll_personnel_stream_v1($1,$2,$3) f',[issuer,enrollEpoch,stream]);
  await waitForLock();await a.query('commit');
  assert.equal(Number((await enrollment).rows[0].f),current+1);
  pass('native observed enrollment lock waits for actual canonical publication commit and captures new head');
  await a.query('begin');
  const leased=(await a.query("select operations_economy_private.claim_accepted_personnel_v1('native-worker-a',20,30) c")).rows[0].c;
  const other=await b.query("select operations_economy_private.claim_accepted_personnel_v1('native-worker-b',20,30) c");assert.equal(other.rows.length,0);await a.query('commit');
  pass('native overlapping accepted workers skip same locked outbox without competing delivery');
  const receipt=ack(leased);
  // Revocation commit wins over an earlier claim: finish must physically wait on
  // the current route row, then reject after seeing enabled=false.
  await a.query('begin');await a.query('update operations_economy_private.personnel_accepted_routes_v1 set enabled=false where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
  const pending=b.query('select operations_economy_private.finish_accepted_personnel_v1($1,$2,$3,$4,$5,$6,null)',[leased.id,leased.lease_owner,leased.lease_token,'delivered',receipt.raw_ack,receipt.signature]).then(()=>({ok:true}),error=>({ok:false,error}));
  await waitForLock();await a.query('commit');const result=await pending;assert.equal(result.ok,false);assert.match(result.error.message,/accepted_route_not_enabled/);
  await db.query('update operations_economy_private.personnel_accepted_routes_v1 set enabled=true where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
  assert.equal((await finish(leased,'delivered',receipt)).rows[0].r.status,'delivered');
  pass('native observed route revocation overlap prevents stale-claim ACK before delivery state change');
  assert.equal((await claim()).rows.length,0);
 }finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.all([a.end(),b.end(),observer.end()]);}
}
