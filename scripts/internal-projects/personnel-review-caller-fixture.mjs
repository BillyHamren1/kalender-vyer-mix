import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
export async function provePersonnelReviewCaller(c){
 const {db,read,org,worker,stream,issuer,v2epoch,pass}=c,project=c.command.snapshot.lines[0].source_project_id,admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-caller.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-review-caller.sql'));
 await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch,enabled) values($1,$2,$3,$4,true)',[org,worker,issuer,v2epoch]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 const get=async(p=project,after=null,limit=20)=>(await db.query('select get_operations_accepted_project_reviews_v1($1,$2,$3) r',[p,after,limit])).rows[0].r;
 const call=async(v)=>(await db.query('select review_and_publish_operations_project_personnel_v1($1,$2,$3,$4,$5,$6,$7) r',v)).rows[0].r;
 const counts=async()=>(await db.query('select (select count(*) from operations_project_personnel_reviews) reviews,(select count(*) from operations_personnel_cost_outbox) outbox')).rows[0];
 const deny=async(fn,pattern)=>{await db.exec('savepoint expected_denial');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to expected_denial');}};
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await deny(()=>get(),/permission denied/);await db.exec('reset role');}
 pass('review caller read/action APIs have no exposed-role execute grants by default');
 let page=await get();assert.ok(page.rows.length>=1);let row=page.rows.find(r=>r.stream===stream);assert.ok(row);assert.equal(row.can_review,true);assert.equal(row.stream,stream);assert.ok(row.lines.length>0);assert.ok(row.lines.every(l=>!('hourly_rate_minor'in l)&&!('source_project_id'in l)));assert.equal(page.next_cursor,null);assert.ok((await get(project,stream)).rows.every(r=>r.stream>stream));const firstPage=await get(project,null,1);assert.equal(firstPage.rows.length,1);assert.ok(firstPage.next_cursor);const secondPage=await get(project,firstPage.next_cursor,1);assert.ok(secondPage.rows.every(r=>r.stream>firstPage.next_cursor));
 pass('project-authorized read uses stable cursor and only filtered line fields');
 const other=randomUUID(),target={...c.command.raw_time_snapshot.blocks[0].target,externalId:other};
 await db.query("insert into projects(id,organization_id,project_kind,is_internal,budget_currency) values($1,$2,'internal_activity',false,'SEK')",[other,org]);
 await db.query('insert into operations_project_metadata_destinations(source_project_id,source_organization_id,first_revision,enabled) values($1,$2,1,true)',[other,org]);
 await db.query('insert into operations_personnel_target_bindings values($1,$2,$3,$4,$5,$6,null,$7,$8)',[org,target.sourceSystem,target.kind,target.externalId,target.version,other,'SEK','review caller mixed fixture']);
 const publishRaw=async(version,blocks)=>{const head=Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r);
  const raw=await c.fixture({version,blocks,attestation:{confirmedByWorker:true,targetKeys:[...new Set(blocks.map(b=>[b.target.sourceSystem,b.target.kind,b.target.externalId,b.target.version].join(':')))]}}),text=JSON.stringify(raw);
  const snapshot=await c.engine.calculatePersonnelCostSnapshot(raw,{...c.ctx,source_revision:head+1,allocations:blocks.map(b=>({...c.ctx.allocations[0],source_time_line_id:b.id,target:b.target,source_project_id:b.target.externalId===other?other:project,source_booking_id:null}))});
  const request=c.makeIssuerRequest({...c.command,expected_revision:head,idempotency_key:'review-caller-source-'+version,snapshot,raw_time_snapshot:raw,source_evidence:{...c.command.source_evidence,raw_snapshot:text,raw_snapshot_sha256:createHash('sha256').update(text).digest('hex')}});
  assert.equal((await db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[request.body,request.timestamp,request.nonce,request.signature])).rows[0].r.status,'accepted');
 };
 await publishRaw(4,[c.command.raw_time_snapshot.blocks[0],{...c.command.raw_time_snapshot.blocks[0],id:randomUUID(),target}]);
 row=(await get()).rows.find(r=>r.stream===stream);assert.equal(row.lines.length,1);assert.equal((await get(other)).rows.find(r=>r.stream===stream).lines.length,1);
 const actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',grantSeq=Number((await db.query('select coalesce(max(grant_sequence),0) n from operations_project_personnel_review_grants where organization_id=$1 and project_id=$2 and system_user_id=$3',[org,project,actor])).rows[0].n);
 await db.query("select operations_economy_private.grant_review_v1($1,$2,$3,'granted','isolated caller grant',$4)",[project,actor,grantSeq,'caller-project-only-grant']);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);assert.equal((await get()).rows.find(r=>r.stream===stream).lines.length,1);await deny(()=>get(other),/explicit_project_review_grant_required/);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 pass('genuine mixed accepted source reveals only selected project lines; restricted actor cannot discover other project');
 const savedDestination=(await db.query('select destination_organization_id d from operations_personnel_transport_routes where organization_id=$1',[org])).rows[0].d;
 await db.query('update operations_personnel_transport_routes set destination_organization_id=$2 where organization_id=$1',[org,randomUUID()]);assert.equal((await get()).rows.find(r=>r.stream===stream).can_review,false);await db.query('update operations_personnel_transport_routes set destination_organization_id=$2 where organization_id=$1',[org,savedDestination]);
 pass('current destination mismatch is nonactionable in read model before any command');

 const before=await counts(),args=[project,stream,row.source_revision,row.review_sequence,'approved',null,randomUUID()];
 const receipt=await call(args);assert.equal(receipt.status,'accepted');assert.equal(receipt.financially_applied,false);const after=await counts();assert.equal(Number(after.reviews),Number(before.reviews)+1);assert.equal(Number(after.outbox),Number(before.outbox)+1);
 const replay=await call(args);assert.equal(replay.status,'duplicate');assert.equal(replay.outbox_id,receipt.outbox_id);assert.deepEqual(await counts(),after);
 for(const [index,value]of[[3,args[3]+1],[4,'reopened'],[5,'changed reason']]){const changed=[...args];changed[index]=value;await deny(()=>call(changed),/review_command_conflict|invalid_review_command/);}
 pass('atomic accepted review creates one event/outbox; exact retry stable and changed body denied');
 let stale=[...args];stale[6]=randomUUID();assert.equal((await call(stale)).status,'stale_source');assert.deepEqual(await counts(),after);
 row=(await get()).rows.find(r=>r.stream===stream);const next=[project,stream,row.source_revision,row.review_sequence,'rejected','isolated test rejection',randomUUID()];
 await db.exec("create function public.fixture_review_fault() returns trigger language plpgsql as $$begin raise exception 'fixture_marker_failure';end;$$;create trigger fixture_review_fault before insert on operations_economy_private.personnel_accepted_issuances_v1 for each row execute function public.fixture_review_fault()");
 await deny(()=>call(next),/fixture_marker_failure/);assert.deepEqual(await counts(),after);await db.exec('drop trigger fixture_review_fault on operations_economy_private.personnel_accepted_issuances_v1;drop function public.fixture_review_fault()');
 assert.equal((await call(next)).status,'accepted');
 pass('stale source does not approve newer evidence; publication fault rolls review and outbox back atomically');
 await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);await deny(()=>call(args),/accepted_review_unavailable/);assert.equal((await get()).rows.find(r=>r.stream===stream).can_review,false);
 await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=true where organization_id=$1 and worker_id=$2',[org,worker]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);await deny(()=>get(),/project|profile|user|access|organization/);await deny(()=>call(args),/project|profile|user|access|organization/);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 pass('current disabled policy and unauthorized actor deny read/write or replay; no legacy fallback');
 await publishRaw(5,[]);const withdrawn=(await get()).rows.find(r=>r.stream===stream);assert.equal(withdrawn.state,'withdrawn');assert.equal(withdrawn.can_review,false);assert.deepEqual(withdrawn.lines,[]);
 pass('genuine empty source correction retains historical project membership as nonactionable withdrawal');
}
