import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
export async function provePersonnelCaller(c){
 const {db,read,org,worker,stream,issuer,v2epoch,command,makeIssuerRequest,pass,descendant}=c;
 await db.exec(read('scripts/internal-projects/personnel-text-booking.sql'));
 await db.exec(read('scripts/internal-projects/accepted-personnel-transport.sql'));
 // Deliver prior accepted epochs through the actual signed-ACK finish, not direct
 // queue state mutation. This isolates the newest reviewed descendant for scoped claims.
 const deliverySecret='caller-fixture-delivery-key-distinct-from-issuer';
 await db.query("insert into operations_economy_private.personnel_accepted_routes_v1 select issuer_id,enrollment_epoch,'https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive',convert_to($1,'UTF8'),true from operations_economy_private.personnel_issuers_v1",[deliverySecret]);
 const ack=claim=>{const raw=JSON.stringify({schema:'operations-personnel-accepted-receipt.v1',outcome:'received',issuer_id:claim.issuer_id,enrollment_epoch:claim.enrollment_epoch,source_organization_id:claim.organization_id,destination_organization_id:claim.destination_organization_id,source_stream_id:claim.source_time_stream_id,source_revision:Number(claim.source_revision),outbox_id:claim.id,envelope_sha256:claim.body_sha256,receipt_id:randomUUID(),financially_applied:false});return [raw,createHmac('sha256',deliverySecret).update('operations-personnel-accepted-ack.v1\n'+raw).digest('hex')];};
 const finish=async claim=>{const [raw,sig]=ack(claim);return (await db.query("select operations_economy_private.finish_accepted_personnel_v1($1,$2,$3,'delivered',$4,$5,null) r",[claim.id,claim.lease_owner,claim.lease_token,raw,sig])).rows[0].r;};
 while(Number((await db.query("select count(*) n from operations_personnel_cost_outbox o join operations_economy_private.personnel_accepted_issuances_v1 m on m.outbox_id=o.id where o.organization_id=$1 and o.source_time_stream_id=$2 and o.source_revision<$3 and o.state<>'delivered'",[org,stream,descendant.source_revision])).rows[0].n)){
  const rows=(await db.query("select operations_economy_private.claim_accepted_personnel_v1('prior-epoch-fixture',1,30) c")).rows;assert.equal(rows.length,1);assert.notEqual(rows[0].c.id,descendant.outbox_id);assert.equal((await finish(rows[0].c)).status,'delivered');
 }
 const oidQuery="select oid::text oid,proname from pg_proc where proname in ('publish_operations_personnel_cost_v1','publish_operations_personnel_cost_ingress_v1','publish_operations_personnel_cost_outbox_v1','publish_project_reviews_v1','record_project_publication_proofs_v1') order by proname";
 const beforeOids=(await db.query(oidQuery)).rows;
 await db.exec(read('scripts/internal-projects/accepted-personnel-caller.sql'));
 assert.deepEqual((await db.query(oidQuery)).rows,beforeOids);
 const ports=(await db.query("select oid,prosecdef from pg_proc where proname like 'canonical_personnel_%'")).rows;assert.equal(ports.length,4);
 for(const port of ports){assert.equal(port.prosecdef,false);for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2::oid,$3) allowed',[role,port.oid,'EXECUTE'])).rows[0].allowed,false);}
 pass('canonical donor OIDs stay behind same legacy facades; every new inner is invoker with no untrusted EXECUTE');

 const deny=async(sql,args=[],role='service_role',pattern=/accepted_worker_requires_verified_issuer/)=>{
  await db.exec('set role '+role);await db.exec('savepoint caller_denial');
  try{await assert.rejects(db.query(sql,args),pattern);}finally{await db.exec('rollback to caller_denial');await db.exec('reset role');}
 };
 const mode=async(s=stream)=>(await db.query('select get_operations_personnel_publish_mode_v1($1,$2,$3) m',[org,worker,s])).rows[0].m;
 assert.equal((await mode()).mode,'blocked');
 await db.query('insert into operations_economy_private.personnel_accepted_workers_v1(organization_id,worker_id,issuer_id,enrollment_epoch) values($1,$2,$3,$4)',[org,worker,issuer,v2epoch]);
 assert.equal((await mode()).mode,'blocked');
 await deny('select get_operations_personnel_publish_mode_v1($1,$2,$3)',[org,worker,stream],'service_role',/permission denied/);
 pass('caller API revoked by default; historical enrollment and disabled worker policy stay blocked');
 const args=[command.snapshot,command.raw_time_snapshot,command.expected_revision,command.idempotency_key];
 await deny('select publish_operations_personnel_cost_v1($1,$2,$3,$4)',args);
 await deny('select publish_operations_personnel_cost_outbox_v1($1,$2,$3,$4,$5)',[args[0],args[1],command.source_evidence,args[2],args[3]]);
 await deny('select publish_operations_personnel_cost_ingress_v1($1,$2,$3,$4,$5)',[args[0],args[1],command.source_evidence,args[2],args[3]]);
 await deny('select publish_operations_personnel_cost_v1($1,$2,$3,$4)',args,'postgres');
 pass('all three legacy publishers deny accepted ownership before replay, including owner-context façade');
 const project=c.ctx.allocations[0].source_project_id;
 const seq=Number((await db.query('select max(review_sequence) s from operations_project_personnel_reviews where organization_id=$1 and source_time_stream_id=$2 and project_id=$3',[org,stream,project])).rows[0].s);
 for(const functionName of ['public.publish_operations_project_personnel_reviews_v1','operations_economy_private.publish_project_reviews_v1'])await deny(`select ${functionName}($1,$2,$3,$4,$5)`,[stream,project,c.lastAcceptedRevision+1,seq,'v2-descendant-freeze'],'authenticated');
 await deny('select operations_economy_private.record_project_publication_proofs_v1($1,$2,0,$3,null,null,null,$4)',[command.snapshot,[],'time_ingress','forged-proof-command']);
 await deny('select operations_economy_private.canonical_personnel_cost_v1($1,$2,$3,$4)',args,'service_role',/permission denied/);
 pass('public/private review replay and proof helper cannot bypass ownership; canonical inner EXECUTE denied');

 const pub=(await db.query('select * from operations_personnel_cost_publications where organization_id=$1 and source_time_stream_id=$2 order by source_revision desc limit 1',[org,stream])).rows[0];
 await deny('update operations_personnel_cost_streams set current_revision=current_revision where organization_id=$1 and source_time_stream_id=$2',[org,stream]);
 await deny('update operations_personnel_cost_streams set worker_id=$3 where organization_id=$1 and source_time_stream_id=$2',[org,stream,randomUUID()]);
 await deny('insert into operations_personnel_cost_streams select organization_id,source_time_stream_id||\':new-day\',worker_id,work_date,time_organization_id,time_auth_worker_id,current_revision,created_at,updated_at from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream]);
 await deny('insert into operations_personnel_cost_publications select * from operations_personnel_cost_publications where organization_id=$1 and source_time_stream_id=$2 and source_revision=$3',[org,stream,pub.source_revision]);
 await deny('insert into operations_personnel_cost_outbox select * from operations_personnel_cost_outbox where id=$1',[descendant.outbox_id]);
 await deny('update operations_personnel_cost_outbox set attempts=attempts+1 where id=$1',[descendant.outbox_id]);
 for(const table of ['operations_personnel_project_publication_links','operations_personnel_project_publication_proofs'])await deny(`insert into ${table} select * from ${table} where organization_id=$1 and source_time_stream_id=$2 limit 1`,[org,stream]);
 pass('direct canonical DML denied for head/publication/outbox/links/proofs; OLD identity cannot move to unowned worker');
 const unowned=randomUUID();await db.query("insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) values($1,'unowned-head',$2,'2026-11-20',$3,$4)",[org,unowned,randomUUID(),randomUUID()]);
 await deny("update operations_personnel_cost_streams set worker_id=$2 where organization_id=$1 and source_time_stream_id='unowned-head'",[org,worker]);
 const sourceIdentity=(await db.query('select time_organization_id,time_auth_worker_id from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,worker])).rows[0];
 await deny("update operations_personnel_cost_streams set time_organization_id=$2,time_auth_worker_id=$3 where organization_id=$1 and source_time_stream_id='unowned-head'",[org,sourceIdentity.time_organization_id,sourceIdentity.time_auth_worker_id]);
 pass('NEW worker and Time source identity cannot move an existing unowned row into accepted ownership');

 assert.equal(Number((await db.query('select count(*) n from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2',[org,stream])).rows[0].n),1);
 await deny("insert into operations_personnel_cost_streams select organization_id,source_time_stream_id||':namespace-alias',$3,work_date,time_organization_id,time_auth_worker_id,current_revision,created_at,updated_at from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2",[org,stream,randomUUID()]);
 await db.exec('savepoint changed_binding');
 await db.query('update operations_personnel_source_bindings set time_personnel_id=$3 where organization_id=$1 and worker_id=$2',[org,worker,randomUUID()]);
 assert.equal((await mode()).mode,'blocked');
 await deny("insert into operations_personnel_cost_streams select organization_id,source_time_stream_id||':old-namespace',$3,work_date,time_organization_id,time_auth_worker_id,current_revision,created_at,updated_at from operations_personnel_cost_streams where organization_id=$1 and source_time_stream_id=$2",[org,stream,randomUUID()]);
 await db.exec('rollback to changed_binding');
 pass('frozen accepted Time namespace cannot be reassigned through forged worker or mutable source binding');
 const alias={...command.snapshot,worker_id:randomUUID(),source_time_stream_id:'unowned-worker:legacy-alias'};
 await deny('select publish_operations_personnel_cost_v1($1,$2,$3,$4)',[alias,command.raw_time_snapshot,command.expected_revision,'forged-source-alias-cost']);
 for(const fn of ['publish_operations_personnel_cost_ingress_v1','publish_operations_personnel_cost_outbox_v1'])await deny(`select ${fn}($1,$2,$3,$4,$5)`,[alias,command.raw_time_snapshot,command.source_evidence,command.expected_revision,'forged-source-alias-ingress']);
 pass('all owner-context source facades fence immutable raw Time identity even with unowned worker and arbitrary legacy stream');


 await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=true where organization_id=$1 and worker_id=$2',[org,worker]);
 assert.equal((await mode()).mode,'accepted');assert.equal((await mode(stream+':new-day')).reason,'accepted_stream_bootstrap_required');
 const req=makeIssuerRequest(command);
 assert.equal((await db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[req.body,req.timestamp,req.nonce,req.signature])).rows[0].r.status,'duplicate');
 pass('verified same-epoch issuer replay still uses canonical implementation; new day cannot fall back to shadow');
 const scoped=(e=v2epoch)=>db.query("select operations_economy_private.claim_accepted_personnel_scoped_v1($1,$2,'scoped-caller',1,60) c",[issuer,e]);
 const beforeAttempts=Number((await db.query('select attempts from operations_personnel_cost_outbox where id=$1',[descendant.outbox_id])).rows[0].attempts);
 assert.equal((await scoped(c.epoch)).rows.length,0);
 const foreignIssuer=randomUUID();await db.query('insert into operations_economy_private.personnel_issuers_v1 select $1,enrollment_epoch,organization_id,destination_organization_id,secret,enabled,metadata_required from operations_economy_private.personnel_issuers_v1 where issuer_id=$2 and enrollment_epoch=$3',[foreignIssuer,issuer,v2epoch]);
 await db.query('insert into operations_economy_private.personnel_accepted_routes_v1 select $1,enrollment_epoch,endpoint_url,secret,enabled from operations_economy_private.personnel_accepted_routes_v1 where issuer_id=$2 and enrollment_epoch=$3',[foreignIssuer,issuer,v2epoch]);
 assert.equal((await db.query("select operations_economy_private.claim_accepted_personnel_scoped_v1($1,$2,'foreign-scope',1,60)",[foreignIssuer,v2epoch])).rows.length,0);

 for(const change of ['disabled','rebound']){await db.exec('savepoint source_revoke');if(change==='disabled')await db.query('update operations_personnel_source_bindings set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);else await db.query('update operations_personnel_source_bindings set time_personnel_id=$3 where organization_id=$1 and worker_id=$2',[org,worker,randomUUID()]);assert.equal((await scoped()).rows.length,0);await db.exec('rollback to source_revoke');}
 assert.equal(Number((await db.query('select attempts from operations_personnel_cost_outbox where id=$1',[descendant.outbox_id])).rows[0].attempts),beforeAttempts);
 const claims=(await scoped()).rows;assert.equal(claims.length,1);assert.equal(claims[0].c.id,descendant.outbox_id);assert.equal(claims[0].c.enrollment_epoch,v2epoch);
 assert.equal((await finish(claims[0].c)).financially_applied,false);
 pass('scoped claim ignores foreign epoch and revoked/rebound source before lease; valid signed ACK finishes without financial application');
 const newIds=await prepareCallerClaimStreams(c);
 const fresh=(await scoped()).rows;assert.equal(fresh.length,1);assert.ok(newIds.includes(fresh[0].c.id));assert.equal((await finish(fresh[0].c)).status,'delivered');
 pass('real issuer creates fresh accepted publications behind private canonical ports from isolated empty stream bootstrap');


 await db.query('update operations_economy_private.personnel_accepted_workers_v1 set enabled=false where organization_id=$1 and worker_id=$2',[org,worker]);
 await deny('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4)',[req.body,req.timestamp,req.nonce,req.signature],'postgres',/accepted_worker_mode_not_enabled/);
 await deny('update operations_economy_private.personnel_accepted_workers_v1 set enrollment_epoch=$3 where organization_id=$1 and worker_id=$2',[org,worker,randomUUID()],'postgres',/ownership_immutable/);
 await deny('delete from operations_economy_private.personnel_accepted_workers_v1 where organization_id=$1 and worker_id=$2',[org,worker],'postgres',/ownership_permanent/);
 pass('disabled mode denies even issued retry; ownership cannot disappear or silently change epoch');
}

// Disposable bootstrap only: no shadow publication and no fabricated accepted
// marker. Production first-day provisioning remains a separate unimplemented gate.
export async function prepareCallerClaimStreams(c){
 const {db,org,worker,issuer,v2epoch,fixture,engine,ctx,command,makeIssuerRequest}=c;
 const binding=(await db.query('select * from operations_personnel_source_bindings where organization_id=$1 and worker_id=$2',[org,worker])).rows[0],outboxes=[];
 for(const date of ['2026-11-01','2026-11-02']){
  const stream=`time:${binding.time_organization_id}:${binding.time_personnel_id}:${date}`;
  await db.query('insert into operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id) values($1,$2,$3,$4,$5,$6)',[org,stream,worker,date,binding.time_organization_id,binding.time_auth_worker_id]);
  await db.query('select operations_economy_private.enroll_personnel_stream_v1($1,$2,$3)',[issuer,v2epoch,stream]);
  const raw=await fixture({workDate:date,version:1,blocks:[],attestation:{confirmedByWorker:true,targetKeys:[]}}),rawText=JSON.stringify(raw);
  const snapshot=await engine.calculatePersonnelCostSnapshot(raw,{...ctx,source_revision:1,source_time_stream_id:stream,allocations:[]});
  const {createHash}=await import('node:crypto');
  const req=makeIssuerRequest({...command,source_stream_id:stream,expected_revision:0,idempotency_key:'caller-empty-new-day-'+date,snapshot,raw_time_snapshot:raw,source_evidence:{...command.source_evidence,raw_snapshot:rawText,raw_snapshot_sha256:createHash('sha256').update(rawText).digest('hex')}});
  const r=(await db.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[req.body,req.timestamp,req.nonce,req.signature])).rows[0].r;assert.equal(r.status,'accepted');outboxes.push(r.outbox_id);
 }
 return outboxes;
}
