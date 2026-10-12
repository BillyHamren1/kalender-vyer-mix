import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Called only after openTestDatabase verifies the dedicated empty loopback DB.
export async function proveReviewAuthorityOverlap({db,org,actor,project,issuer,epoch,stream,head,seq,key,issue,pass}) {
 const dsn=process.env.INTERNAL_PROJECTS_TEST_DSN;
 const url=new URL(dsn);
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/accepted_personnel_cost_ci'&&!url.search&&!url.hash);
 const {Client}=require('pg');
 const clients=['review-authority-blocker','review-authority-command','review-authority-revoker'].map(application_name=>new Client({connectionString:dsn,application_name,connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:12000}));
 const [blocker,command,revoker]=clients;
 await Promise.all(clients.map(c=>c.connect()));
 const pid=async c=>Number((await c.query('select pg_backend_pid() p')).rows[0].p);
 const [blockerPid,commandPid,revokerPid]=await Promise.all(clients.map(pid));
 const waitBlocked=async(waiter,holder)=>{
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){const r=await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter,holder]);if(r.rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.fail(`backend ${waiter} did not physically block on ${holder}`);
 };
 let pendingCommand,pendingRevoke;
 try {
  // Revocation first: command must wait on the authority row and then reject
  // under the committed new authority, without creating a marker/publication.
  const before=(await db.query('select count(*)::int n from operations_economy_private.personnel_accepted_issuances_v1')).rows[0].n;
  await revoker.query('begin');
  const revokedFirst=(await revoker.query('delete from public.user_roles where user_id=$1 and organization_id=$2 returning *',[actor,org])).rows;
  assert.ok(revokedFirst.length>0);
  await command.query('begin');await command.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
  pendingCommand=command.query('select operations_economy_private.issue_personnel_project_review_v1($1,$2,$3,$4,$5,$6,$7) r',[issuer,epoch,stream,project,head,seq,key]);pendingCommand.catch(()=>{});
  await waitBlocked(commandPid,revokerPid);await revoker.query('commit');
  await assert.rejects(pendingCommand,/project_review_admin_required/);await command.query('rollback');
  assert.equal((await db.query('select count(*)::int n from operations_economy_private.personnel_accepted_issuances_v1')).rows[0].n,before);
  assert.equal(Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r),head);
  for(const row of revokedFirst)await db.query('insert into public.user_roles(id,user_id,organization_id,role) values($1,$2,$3,$4)',[row.id,row.user_id,row.organization_id,row.role]);
  pass('native physical overlap: already-running role revocation commits before authorization and denies publication');
  await blocker.query('begin');
  await blocker.query('select 1 from operations_economy_private.personnel_issuers_v1 where issuer_id=$1 and enrollment_epoch=$2 for update',[issuer,epoch]);
  await command.query('begin');await command.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
  pendingCommand=command.query('select operations_economy_private.issue_personnel_project_review_v1($1,$2,$3,$4,$5,$6,$7) r',[issuer,epoch,stream,project,head,seq,key]);
  // Attach handlers immediately so failure cleanup cannot leave unhandled rejects.
  pendingCommand.catch(()=>{});
  await waitBlocked(commandPid,blockerPid);
  await revoker.query('begin');
  pendingRevoke=revoker.query('delete from public.user_roles where user_id=$1 and organization_id=$2 returning *',[actor,org]);pendingRevoke.catch(()=>{});
  await waitBlocked(revokerPid,commandPid);
  await blocker.query('commit');
  const accepted=(await pendingCommand).rows[0].r;assert.equal(accepted.status,'accepted');
  // Revocation remains physically blocked even after SQL returns, until commit.
  await waitBlocked(revokerPid,commandPid);
  await command.query('commit');
  const removed=(await pendingRevoke).rows;assert.ok(removed.length>0);await revoker.query('commit');
  await assert.rejects(issue(head,seq,key,actor),/project_review_admin_required/);
  for(const row of removed)await db.query('insert into public.user_roles(id,user_id,organization_id,role) values($1,$2,$3,$4)',[row.id,row.user_id,row.organization_id,row.role]);
  pass('native physical overlap: role revocation waits for authorized publication transaction, committed revocation denies exact retry');
  return accepted;
 } finally {
  // Release blocker first, then settle pending work before rollback/end.
  await blocker.query('rollback').catch(()=>{});
  await pendingCommand?.catch(()=>{});await command.query('rollback').catch(()=>{});
  await pendingRevoke?.catch(()=>{});await revoker.query('rollback').catch(()=>{});
  await Promise.all(clients.map(c=>c.end()));
 }
}
