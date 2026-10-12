import assert from 'node:assert/strict';
import {proveReviewAuthorityOverlap} from './accepted-personnel-review-native.mjs';
export async function proveAcceptedReviews({db,read,as,org,worker,stream,issuer,epoch,epoch2,next,lastAcceptedRevision,pass}) {
 await db.exec(read('scripts/internal-projects/accepted-personnel-review.sql'));
 const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const project=next.snapshot.lines[0].source_project_id, other='77777777-7777-4777-8777-777777777777';
 const current=async()=>Number((await db.query('select current_revision r from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].r);
 const counts=async()=>(await db.query('select (select count(*) from operations_personnel_cost_publications)::int publications,(select count(*) from operations_personnel_cost_outbox)::int outbox,(select count(*) from operations_personnel_project_publication_links)::int links,(select count(*) from operations_economy_private.personnel_accepted_issuances_v1)::int markers')).rows[0];
 const issue=async(expected,seq,key,who=admin,ep=epoch,proj=project)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);return (await db.query('select operations_economy_private.issue_personnel_project_review_v1($1,$2,$3,$4,$5,$6,$7) r',[issuer,ep,stream,proj,expected,seq,key])).rows[0].r;};
 const review=async(expected,seq,decision,key,who=admin)=>(await as('authenticated',()=>db.query('select review_operations_project_personnel_v1($1,$2,$3,$4,$5,$6,$7) r',[stream,project,expected,seq,decision,decision==='approved'?null:'isolated reviewer fixture',key]),who)).rows[0].r;
 const grant=async(decision)=>{const seq=Number((await db.query('select coalesce(max(grant_sequence),0) s from operations_project_personnel_review_grants where organization_id=$1 and project_id=$2 and system_user_id=$3',[org,project,actor])).rows[0].s);return as('authenticated',()=>db.query('select grant_operations_project_personnel_review_v1($1,$2,$3,$4,$5,$6)',[project,actor,seq,decision,'isolated review authorization','descendant-grant-'+seq]));};
 const frozen=lines=>lines.map(({status,...line})=>line);
 const original=frozen(next.snapshot.lines);
 const check=async(r,status)=>{assert.equal(r.status,'accepted');const row=(await db.query('select raw_body::jsonb b from operations_personnel_cost_outbox where id=$1',[r.outbox_id])).rows[0].b;assert.deepEqual(frozen(row.lines),original);assert.ok(row.lines.every(l=>l.status===status));const marker=(await db.query('select raw_envelope::jsonb e from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=$1',[r.outbox_id])).rows[0].e;assert.deepEqual(marker.snapshot,row);assert.equal(marker.membership,'full_stream');};
 assert.equal(await current(),lastAcceptedRevision);
 for(const role of ['anon','authenticated','service_role']) await assert.rejects(as(role,()=>db.query('select operations_economy_private.issue_personnel_project_review_v1($1,$2,$3,$4,6,4,$5)',[issuer,epoch,stream,project,'exposed-review-denial'])),/permission denied/);
 pass('accepted review draft has no exposed role execute permission');
 await assert.rejects(issue(4,3,'floor-ancestor-denial'),/review_ancestor_below_floor_or_absent/);
 await assert.rejects(issue(6,3,'foreign-epoch-denial',admin,epoch2),/accepted_review_ancestor_required/);
 await assert.rejects(issue(6,3,'cross-project-denial',actor,epoch,other),/explicit_project_review_grant_required|project/);
 await grant('granted');
 let seq=Number((await db.query('select max(review_sequence) s from operations_project_personnel_reviews where organization_id=$1 and source_time_stream_id=$2 and project_id=$3',[org,stream,project])).rows[0].s);
 let head=lastAcceptedRevision;
 let approved=await review(head,seq,'approved','descendant-approved',actor);seq=approved.review_sequence;
 const before=await counts();
 assert.equal((await issue(head,seq+1,'stale-review-command',actor)).status,'stale_review');assert.deepEqual(await counts(),before);
 const key='accepted-descendant-approve';
 const accepted=process.env.INTERNAL_PROJECTS_TEST_DSN
  ? await proveReviewAuthorityOverlap({db,org,actor,project,issuer,epoch,stream,head,seq,key,issue,pass})
  : await issue(head,seq,key,actor);await check(accepted,'confirmed');
 const replay=await issue(head,seq,key,actor);assert.equal(replay.status,'duplicate');assert.equal(replay.fingerprint,accepted.fingerprint);
 await assert.rejects(issue(head,seq,key,admin),/idempotency_conflict/);
 await db.query('update operations_economy_private.personnel_issuers_v1 set enabled=false where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
 await assert.rejects(issue(head,seq,key,actor),/review_issuer_not_enrolled/);
 await db.query('update operations_economy_private.personnel_issuers_v1 set enabled=true where issuer_id=$1 and enrollment_epoch=$2',[issuer,epoch]);
 await grant('revoked');await assert.rejects(issue(head,seq,key,actor),/explicit_project_review_grant_required/);await grant('granted');
 await db.query('update operations_personnel_source_bindings set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);
 await assert.rejects(issue(head,seq,key,actor),/review_source_binding_changed/);
 await db.query('update operations_personnel_source_bindings set enabled=true where organization_id=$1 and worker_id=$2',[org,worker]);
 await db.query('update operations_personnel_transport_routes set destination_organization_id=$2 where organization_id=$1',[org,'cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
 await assert.rejects(issue(head,seq,key,actor),/review_destination_changed/);
 await db.query('update operations_personnel_transport_routes set destination_organization_id=$2 where organization_id=$1',[org,admin]);
 pass('same-epoch accepted ancestor, current grant/binding/destination and actor-bound retry enforced');
 assert.equal((await issue(head,seq,'stale-head-new-key',actor)).status,'stale_source');
 head++;
 for(const [decision,status] of [['rejected','rejected'],['reopened','preliminary']]) {
  seq=(await review(head,seq,decision,'descendant-review-'+decision,actor)).review_sequence;
  const bodyKey='descendant-publish-'+decision;
  if(decision==='rejected') {
   const beforeFault=await counts();
   await db.exec("create function operations_economy_private.review_marker_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic_review_marker_fault';end$$;create trigger review_marker_fault before insert on operations_economy_private.personnel_accepted_issuances_v1 for each row execute function operations_economy_private.review_marker_fault()");
   await assert.rejects(issue(head,seq,bodyKey,actor),/synthetic_review_marker_fault/);
   assert.deepEqual(await counts(),beforeFault);assert.equal(await current(),head);
   await db.exec('drop trigger review_marker_fault on operations_economy_private.personnel_accepted_issuances_v1');
  }
  await check(await issue(head,seq,bodyKey,actor),status);head++;
 }
 pass('preliminary to confirmed to rejected to reopened retains all frozen money; marker fault rolls back canonical rows and head');
 // Existing canonical route can create a shadow descendant; its exact retry must
 // not gain a new accepted marker merely by entering this wrapper later.
 seq=(await review(head,seq,'approved','shadow-descendant-review',actor)).review_sequence;
 const shadowKey='canonical-shadow-descendant';
 const shadow=(await as('authenticated',()=>db.query('select publish_operations_project_personnel_reviews_v1($1,$2,$3,$4,$5) r',[stream,project,head,seq,shadowKey]),actor)).rows[0].r;
 assert.equal(shadow.status,'accepted');const shadowCounts=await counts();
 await assert.rejects(issue(head,seq,shadowKey,actor),/shadow_review_publication_not_issued/);assert.deepEqual(await counts(),shadowCounts);
 await assert.rejects(issue(head+1,seq,'shadow-next-descendant',actor),/accepted_review_ancestor_required/);
 pass('canonical shadow retry and its descendant cannot manufacture accepted issuance');
}
