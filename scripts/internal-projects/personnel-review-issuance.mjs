import assert from 'node:assert/strict';
export async function proveReviewIssuance({db,read,as,org,admin,project,stream,snapshot,pass}) {
  const actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other='77777777-7777-4777-8777-777777777777';
  await db.exec('grant insert,update,delete on operations_project_personnel_review_grants,operations_project_personnel_reviews to service_role');
  await as('service_role',()=>db.query(`insert into operations_project_personnel_review_grants(organization_id,project_id,system_user_id,actor_system_user_id,decision,reason,idempotency_key)
    values($1,$2,$3,$4,'granted','forged before migration','old-forged-grant')`,[org,project,actor,admin]));
  await as('service_role',()=>db.query(`insert into operations_project_personnel_reviews(organization_id,source_time_stream_id,source_revision,source_time_report_id,source_snapshot_hash,time_snapshot_version,project_id,source_time_line_ids,economics_fingerprint,decision,actor_system_user_id,reason,idempotency_key)
    select $1,$2,1,($3::jsonb->>'source_time_report_id')::uuid,$3::jsonb->>'source_snapshot_hash',1,$4,'["line-a"]',operations_economy_private.project_fingerprint_v1($3,$4),'approved',$5,null,'old-forged-review'`,[org,stream,snapshot,project,admin]));
  const publish=(expected,seq,key)=>as('authenticated',()=>db.query('select publish_operations_project_personnel_reviews_v1($1,$2,$3,$4,$5) r',[stream,project,expected,seq,key]));
  const saved=(await db.query('select p.raw_time_snapshot,o.source_evidence from operations_personnel_cost_publications p join operations_personnel_cost_outbox o using(organization_id,source_time_stream_id,source_revision) where p.organization_id=$1 and p.source_time_stream_id=$2 and p.source_revision=1',[org,stream])).rows[0];
  const oldIngressSnapshot={...snapshot,source_revision:2};
  const oldIngress=()=>as('service_role',()=>db.query('select publish_operations_personnel_cost_ingress_v1($1,$2,$3,1,$4) r',[oldIngressSnapshot,saved.raw_time_snapshot,saved.source_evidence,'old-forged-ingress']));
  assert.equal((await oldIngress()).rows[0].r.status,'accepted');
  assert.equal((await publish(2,1,'old-forged-publication')).rows[0].r.status,'accepted');
  await db.exec(read('supabase/migrations/20261012165000_operations_personnel_review_issuance.sql'));
  for(const role of ['service_role','authenticated','anon']) {
    for(const table of ['operations_project_personnel_review_grants','operations_project_personnel_reviews'])
      await assert.rejects(as(role,()=>db.query(`insert into ${table}(organization_id) values($1)`,[org])),/permission denied/);
    for(const table of ['accepted_project_grant_issuances_v1','accepted_project_review_issuances_v1'])
      await assert.rejects(as(role,()=>db.query(`insert into operations_economy_private.${table} values(gen_random_uuid())`)),/permission denied/);
  }
  await assert.rejects(as('service_role',()=>db.query('select grant_operations_project_personnel_review_v1($1,$2,0,$3,$4,$5)',[project,actor,'granted','bad service actor','bad-service-issuance'])),/permission denied/);
  pass('review/grant inherited service writes revoked; exposed roles cannot forge issuance references');
  await assert.rejects(as('authenticated',()=>db.query('select get_operations_project_personnel_review_v1($1,$2)',[stream,project]),actor),/explicit_project_review_grant_required/);
  const get=()=>as('authenticated',()=>db.query('select get_operations_project_personnel_review_v1($1,$2) r',[stream,project]));
  assert.equal((await get()).rows[0].r.status,'no_current_review');
  pass('pre-migration forged grant grants no authority and forged review is not current');
  await assert.rejects(publish(2,1,'old-forged-publication'),/legacy_publication_review_not_issued/);
  await assert.rejects(oldIngress(),/legacy_publication_review_not_issued/);
  pass('old forged confirmed publication and canonical ingress retry cannot promote historical review');
  const grant=(decision,key,expected)=>as('authenticated',()=>db.query('select grant_operations_project_personnel_review_v1($1,$2,$3,$4,$5,$6) r',[project,actor,expected,decision,'forged before migration',key]));
  await assert.rejects(grant('granted','old-forged-grant',0),/legacy_grant_event_not_issued/);
  const review=(actorId,expected,seq,key)=>as('authenticated',()=>db.query('select review_operations_project_personnel_v1($1,$2,$3,$4,$5,null,$6) r',[stream,project,expected,seq,'approved',key]),actorId);
  await assert.rejects(review(admin,1,0,'old-forged-review'),/legacy_review_event_not_issued/);
  pass('old exact grant/review command retries never acquire prospective markers');
  const grantReceipt=(await grant('granted','prospective-grant',1)).rows[0].r;assert.equal(grantReceipt.status,'accepted');
  assert.equal((await grant('granted','prospective-grant',1)).rows[0].r.status,'duplicate');
  const receipt=(await review(actor,3,1,'prospective-review')).rows[0].r;assert.equal(receipt.status,'accepted');
  assert.equal((await review(actor,3,1,'prospective-review')).rows[0].r.status,'duplicate');
  assert.equal((await get()).rows[0].r.status,'current');
  pass('authenticated grant and delegated review issue atomically; exact retries stable');
  const both=structuredClone(snapshot);both.lines.push({...both.lines[0],source_time_line_id:'line-b',source_project_id:other});
  const projection=await as('service_role',()=>db.query("select operations_economy_private.derive_project_status_snapshot_v1($1,'submitted',3) r",[both]));
  assert.deepEqual(projection.rows[0].r.snapshot.lines.map(l=>l.status),['confirmed','preliminary']);
  pass('project A issued review cannot confirm project B');
  const publication=(await publish(3,receipt.review_sequence,'prospective-publication')).rows[0].r;assert.equal(publication.status,'accepted');
  assert.equal((await publish(3,receipt.review_sequence,'prospective-publication')).rows[0].r.status,'duplicate');
  pass('issued project review derives and publishes canonical confirmation with durable retry');
  for(const change of [{rate_revision:'unreviewed'},{hourly_rate_minor:1},{amount_minor:1},{currency:'EUR'},{minutes:1}]) {
    const bad=structuredClone(snapshot);Object.assign(bad.lines[0],change);
    await assert.rejects(as('service_role',()=>db.query('select operations_economy_private.assert_issued_frozen_rates_v1($1,$2)',[bad,saved.raw_time_snapshot])),/accepted_frozen_rate_provenance_required/);
  }
  const shadow={...structuredClone(snapshot),source_time_stream_id:stream+':shadow',worker_id:'66666666-6666-4666-8666-666666666666'};shadow.lines[0].rate_revision='unreviewed';
  await as('service_role',()=>db.query('select publish_operations_personnel_cost_v1($1,$2,0,$3)',[shadow,saved.raw_time_snapshot,'shadow-old-publication']));
  await as('service_role',()=>db.query(`insert into operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,source_evidence,destination_organization_id,key_id,endpoint_url)
    select organization_id,$2,1,$3,encode(sha256(convert_to($3,'UTF8')),'hex'),source_evidence,destination_organization_id,key_id,endpoint_url from operations_personnel_cost_outbox where organization_id=$1 and source_time_stream_id=$4 and source_revision=1`,[org,shadow.source_time_stream_id,JSON.stringify(shadow),stream]));
  const shadowReview=await as('authenticated',()=>db.query("select review_operations_project_personnel_v1($1,$2,1,0,'approved',null,'shadow-current-review') r",[shadow.source_time_stream_id,project]));
  await assert.rejects(as('authenticated',()=>db.query('select publish_operations_project_personnel_reviews_v1($1,$2,1,$3,$4)',[shadow.source_time_stream_id,project,shadowReview.rows[0].r.review_sequence,'shadow-republish-attempt'])),/accepted_frozen_rate_provenance_required/);
  pass('issued review cannot promote shadow economics; frozen rate/category/currency/minutes/amount basis independently checked');
  const rejected=(await as('authenticated',()=>db.query("select review_operations_project_personnel_v1($1,$2,4,$3,'rejected','fixture rejection','semantic-rejected-review') r",[stream,project,receipt.review_sequence]))).rows[0].r;
  const genuineProof=(await db.query('select * from operations_personnel_project_publication_proofs where organization_id=$1 and source_time_stream_id=$2 and source_revision=4',[org,stream])).rows[0];
  for(const [revision,reviewEvent,reviewSeq,state] of [[90,rejected.event_id,rejected.review_sequence,'submitted'],[91,receipt.event_id,receipt.review_sequence,'voided'],[92,receipt.event_id,receipt.review_sequence,'correction_requested']]) {
    const fake={...structuredClone(snapshot),source_revision:revision};fake.lines[0].status='confirmed';
    await as('service_role',()=>db.query(`insert into operations_personnel_cost_publications(organization_id,source_time_stream_id,source_revision,source_time_report_id,time_snapshot_version,source_snapshot_hash,idempotency_key,cost_snapshot,raw_time_snapshot)
      select organization_id,source_time_stream_id,$3,source_time_report_id,time_snapshot_version,source_snapshot_hash,$4,$5,raw_time_snapshot from operations_personnel_cost_publications where organization_id=$1 and source_time_stream_id=$2 and source_revision=4`,[org,stream,revision,'fake-proof-publication-'+revision,fake]));
    await as('service_role',()=>db.query(`insert into operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,source_evidence,destination_organization_id,key_id,endpoint_url)
      select organization_id,source_time_stream_id,$3,$4,encode(sha256(convert_to($4,'UTF8')),'hex'),jsonb_set(source_evidence,'{submission_state}',to_jsonb($5::text)),destination_organization_id,key_id,endpoint_url from operations_personnel_cost_outbox where organization_id=$1 and source_time_stream_id=$2 and source_revision=4`,[org,stream,revision,JSON.stringify(fake),state]));
    const fakeProof={...genuineProof,review_event_id:reviewEvent,review_sequence:reviewSeq,applied_status:'confirmed'};
    await as('service_role',()=>db.query("select operations_economy_private.record_project_publication_proofs_v1($1,$2,4,'time_ingress',null,null,null,$3)",[fake,JSON.stringify([fakeProof]),'fake-proof-link-'+revision]));
    await assert.rejects(as('service_role',()=>db.query('select operations_economy_private.assert_issued_publication_reviews_v1($1,$2,$3)',[org,stream,revision])),/legacy_publication_review_not_issued/);
  }
  pass('forged confirmed proofs cannot relabel issued rejection or voided/correction-requested source');
  await grant('revoked','prospective-revoke',grantReceipt.grant_sequence);
  await assert.rejects(review(actor,4,receipt.review_sequence,'revoked-review-attempt'),/explicit_project_review_grant_required/);
  assert.equal((await get()).rows[0].r.status,'current');
  pass('current grant revocation denies new review but preserves already issued immutable evidence');
}
