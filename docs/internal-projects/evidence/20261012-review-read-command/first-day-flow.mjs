import assert from 'node:assert/strict';
import {dispatchActualMetadata} from './metadata-oracle.mjs';
export async function runFirstDayFlow({c,db,source,records,receiver,writer,invoice,customer,beforeCustomer,destinations,org,operationsRoot,financeRoot,metadataSecret,metadata}){
 const run=lose=>source.caller.dispatch(receiver,lose);
 const retry=()=>c.db.exec("update operations_personnel_cost_outbox set next_attempt_at=now()-interval '1 second' where state='retry'");
 let result=await run(false);assert.equal(result.length,1);assert.equal(result[0].outbox_id,records[0].outbox_id);assert.equal(result[0].status,'retry');assert.equal(await writer.eventCount(),0);
 console.log('FIRST DAY PASS actual caller dispatch branch retries missing causal metadata with zero money');
 const delivered=await dispatchActualMetadata({odb:c.db,db,operationsRoot,financeRoot,issuer:'metadata',secret:metadataSecret});assert.equal(delivered,metadata.length);assert.deepEqual(await writer.customerState(customer),beforeCustomer);await invoice.assertUnchanged();await retry();
 result=await run(true);assert.equal(result.length,1);assert.equal(result[0].status,'retry');assert.equal(await writer.eventCount(),0);assert.equal((await db.query('select count(*)::int n from finance_private.operations_accepted_receipts')).rows[0].n,1);await retry();
 console.log('FIRST DAY PASS actual caller dispatch lost committed response preserves one receipt and zero money');
 for(let n=0;n<records.length;n++){
  result=await run(false);assert.equal(result.length,1);assert.equal(result[0].outbox_id,records[n].outbox_id);assert.equal(result[0].status,'delivered');
  const receipt=(await db.query('select receipt_id from finance_private.operations_accepted_receipts where outbox_id=$1',[records[n].outbox_id])).rows[0];assert.ok(receipt);
  for(const part of source.parts){const evidence=await writer.evidence(org,destinations.get(part.project));assert.equal(evidence.coverage.wholeProject,'unverified');assert.equal(evidence.coverage.unlocksFinancialClose,false);assert.equal(evidence.observedEvidence.pendingFinancialReview,1);if(n===0){assert.equal(evidence.knownAppliedPersonnel.state,'none_observed');assert.equal(evidence.knownAppliedPersonnel.actualMinor,null);}else{const previous=[[120000,90000,30000],[120000,90000,30000],[120000,60000,0]][n-1][source.parts.indexOf(part)];assert.equal(BigInt(evidence.knownAppliedPersonnel.actualMinor)+BigInt(evidence.knownAppliedPersonnel.accrualMinor),BigInt(previous));assert.equal(evidence.observedEvidence.staleAppliedStreams,1);}}
  const countBefore=await writer.eventCount();if(n===0)assert.equal(countBefore,0);
  await writer.apply(receipt.receipt_id,org);const count=await writer.eventCount();await writer.apply(receipt.receipt_id,org);assert.equal(await writer.eventCount(),count);
  await writer.denyGeneric();assert.equal(await writer.eventCount(),count);
  const balances=await writer.balances();assert.equal(balances.reduce((sum,x)=>sum+x.actual_minor+x.accrual_minor,0),[240000,240000,180000,0][n]);
  const expected=[[120000,90000,30000],[120000,90000,30000],[120000,60000,0],[0,0,0]][n];for(let k=0;k<source.parts.length;k++){const b=balances.find(x=>x.project_id===destinations.get(source.parts[k].project));assert.equal(b.actual_minor+b.accrual_minor,expected[k]);}
  for(let k=0;k<source.parts.length;k++){const evidence=await writer.evidence(org,destinations.get(source.parts[k].project));assert.equal(evidence.coverage.wholeProject,'unverified');assert.equal(evidence.coverage.personnelCensus,'unknown');assert.equal(evidence.coverage.unlocksFinancialClose,false);assert.equal(BigInt(evidence.knownAppliedPersonnel.actualMinor)+BigInt(evidence.knownAppliedPersonnel.accrualMinor),BigInt(expected[k]));assert.equal(evidence.observedEvidence.pendingFinancialReview,0);}
  assert.deepEqual(await writer.customerState(customer),beforeCustomer);await invoice.assertUnchanged();console.log('FIRST DAY PASS actual caller ingest/dispatch and explicit Finance command',n,{total:[240000,240000,180000,0][n]});
 }
 assert.deepEqual(await run(false),[]);await db.close();
}
