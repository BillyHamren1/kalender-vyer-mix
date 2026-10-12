import {readFileSync} from 'node:fs';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function runAcceptedTransportCases({odb,db,rows,envelope,secret,receiver,createAcceptedCostReceiver,receiverConfig,sender,pass,rpcCalls,operationsRoot}) {
 const endpoint='https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive';
 const config={enabled:true,endpoint,issuerId:envelope.issuer_id,enrollmentEpoch:envelope.enrollment_epoch,secret};
 await odb.exec(readFileSync(operationsRoot+'/scripts/internal-projects/accepted-personnel-transport.sql','utf8'));
 await odb.query("insert into operations_economy_private.personnel_accepted_routes_v1 values($1,$2,$3,convert_to($4,'UTF8'),true)",[config.issuerId,config.enrollmentEpoch,endpoint,secret]);
 const claim=async()=> (await odb.query("select operations_economy_private.claim_accepted_personnel_v1('composition',1,120) c")).rows.map(r=>r.c);
 const dispatch=(c,fetcher=(url,init)=>receiver(new Request(url,init)))=>sender.dispatchAcceptedPersonnelClaim(c,config,fetcher);
 const finish=(c,r)=>odb.query('select operations_economy_private.finish_accepted_personnel_v1($1,$2,$3,$4,$5,$6,$7) r',[c.id,c.lease_owner,c.lease_token,r.outcome,r.receipt?.raw_ack??null,r.receipt?.signature??null,r.error??null]);
 const counts=async()=>(await db.query('select (select count(*)::int from finance_private.operations_accepted_receipts) receipts,(select count(*)::int from finance_operations_personnel_cost_snapshots) snapshots,(select count(*)::int from finance_cost_events) events')).rows[0];
 let [first]=await claim();assert.ok(first);assert.equal(first.raw_body,rows[0].raw_envelope);assert.equal(first.body_sha256,createHash('sha256').update(first.raw_body).digest('hex'));
 assert.deepEqual(await claim(),[]);pass('actual Operations claim leases earliest accepted revision only');
 const unavailable=createAcceptedCostReceiver(receiverConfig,async()=>{throw new Error('synthetic backend unavailable');});
 let outageStatus;
 const outage=await dispatch(first,async(url,init)=>{const response=await unavailable(new Request(url,init));outageStatus=response.status;return response;});
 assert.equal(outageStatus,503);assert.equal(outage.outcome,'retry');await finish(first,outage);assert.deepEqual(await counts(),{receipts:0,snapshots:0,events:0});
 await odb.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");
 [first]=await claim();assert.ok(first);pass('transient Finance receive failure returns503 and source remains retryable without receipt or money');
 let captured,badAckStatus;
 const badAck=await dispatch(first,async(url,init)=>{captured={url,init};const response=await receiver(new Request(url,init));badAckStatus=response.status;const result=await response.json();return Response.json({...result,signature:'0'.repeat(64)});});
 assert.equal(badAckStatus,200);assert.notEqual(badAck.outcome,'delivered');assert.deepEqual(await counts(),{receipts:1,snapshots:1,events:0});
 await finish(first,badAck);pass('actual receiver commits full source stream but invalid signed ACK cannot finish Operations');
 await odb.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");
 const [retryClaim]=await claim();assert.ok(retryClaim,'invalid ACK must be retryable, not terminal');assert.equal(retryClaim.id,first.id);
 let lostStatus;
 const lost=await dispatch(retryClaim,async(url,init)=>{const response=await receiver(new Request(url,init));lostStatus=response.status;throw new Error('synthetic lost committed response');});
 assert.equal(lostStatus,200);assert.equal(lost.outcome,'retry');await finish(retryClaim,lost);assert.deepEqual(await counts(),{receipts:1,snapshots:1,events:0});pass('lost committed response retains one immutable receipt and retryable source');
 await odb.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");
 const [finalClaim]=await claim();const good=await dispatch(finalClaim);assert.equal(good.outcome,'delivered');
 const ack=JSON.parse(good.receipt.raw_ack);assert.equal(ack.outcome,'replayed');assert.equal(ack.financially_applied,false);
 await finish(finalClaim,good);assert.equal((await odb.query('select state from operations_personnel_cost_outbox where id=$1',[first.id])).rows[0].state,'delivered');
 assert.deepEqual(await counts(),{receipts:1,snapshots:1,events:0});pass('fresh nonce retry verifies exact Finance signed ACK and actual SQL finish exactly once');
 const port=(await db.query('select * from finance_private.operations_verified_cost_stream_receipts')).rows[0];
 assert.equal(port.source_revision,envelope.source_revision);assert.equal(port.coverage,'complete');
 assert.equal(port.lines.length,envelope.snapshot.lines.length);
 for(const line of envelope.snapshot.lines){const received=port.lines.find(l=>l.source_line_id===line.source_time_line_id);assert.ok(received);assert.equal(Number(received.amount_minor),line.amount_minor);assert.equal(received.status,line.status);}
 pass('accepted stream port preserves complete membership, source identity, exact amounts and statuses');
 const beforeRpc=rpcCalls();const tampered=new Request(captured.url,{...captured.init,body:captured.init.body+' '});assert.equal((await receiver(tampered)).status,403);assert.equal(rpcCalls(),beforeRpc);pass('raw byte tamper rejected before Finance SQL');
 function requestFor(e){const raw=JSON.stringify(e),timestamp=String(Math.floor(Date.now()/1000)),nonce=randomUUID();const signature=createHmac('sha256',secret).update(['operations-personnel-accepted-delivery.v1','operations-personnel-accepted-receive',timestamp,nonce,e.issuer_id,e.enrollment_epoch,raw].join('\n')).digest('hex');return new Request(endpoint,{method:'POST',headers:{'x-eventflow-timestamp':timestamp,'x-eventflow-nonce':nonce,'x-eventflow-signature':signature,'x-eventflow-issuer-id':e.issuer_id,'x-eventflow-enrollment-epoch':e.enrollment_epoch},body:raw});}
 for(const field of ['source_organization_id','destination_organization_id','enrollment_epoch']){assert.equal((await receiver(requestFor({...envelope,[field]:randomUUID()}))).status,403);}
 assert.equal(rpcCalls(),beforeRpc);pass('correctly signed wrong source tenant, destination tenant or epoch rejected before SQL');
 const [next]=await claim();assert.ok(next);const nextEnvelope=JSON.parse(next.raw_body);
 await db.query('select finance_private.ingest_operations_personnel_cost_bound_v1($1)',[JSON.stringify(nextEnvelope.snapshot)]);
 const shadowResult=await dispatch(next);assert.notEqual(shadowResult.outcome,'delivered');assert.equal((await counts()).receipts,1);assert.equal((await counts()).snapshots,2);assert.equal((await counts()).events,0);
 pass('preexisting exact shadow snapshot cannot be promoted by real accepted delivery');
 assert.equal((await db.query('select count(*)::int n from finance_private.operations_verified_cost_stream_receipts')).rows[0].n,1);
 pass('no canonical money events before explicit Finance actor command');
}
