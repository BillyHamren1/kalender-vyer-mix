// Run from recovery-customer-metadata; all owner fixture checks remain enabled.
import{readFileSync,writeFileSync}from'node:fs';import{createRequire}from'node:module';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{prepareMixedSource}from'./source-mixed-fixture.mjs';
const require=createRequire(resolve('package.json')),ts=require('typescript');
const textRoot=resolve(process.env.TEXT_BOOKING_SOURCE_ROOT??'../recovery-text-booking');
const engineSource=readFileSync(textRoot+'/supabase/functions/_shared/project-personnel-cost.ts','utf8');
const engine=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(engineSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
globalThis.afterCausalIssuer=async c=>{
 const source=await prepareMixedSource(c,engine),records=[];
 for(const [operation,amount,lines]of[['first',240000,3],['review',240000,3],['correction',180000,2],['empty',0,0]]){
  const record=await source[operation](),e=JSON.parse(record.raw_envelope);records.push(record);
  assert.equal(e.schema,'operations-personnel-accepted-envelope.v2');assert.equal(e.snapshot.lines.length,lines);assert.equal(e.snapshot.lines.reduce((n,l)=>n+l.amount_minor,0),amount);assert.equal(e.project_metadata_refs.length,lines);
  console.log('MIXED SOURCE PASS',operation,{amount,lines,revision:e.source_revision});
 }
 const metadata=(await c.db.query('select * from operations_project_metadata_outbox order by source_project_id,revision')).rows;
 if(globalThis.afterMixedSource)await globalThis.afterMixedSource({c,source,records,metadata});
 writeFileSync(new URL('./mixed-source-evidence.json',import.meta.url),JSON.stringify({synthetic:true,hosted:false,records,metadata},null,2)+'\n');
};
process.env.PERSONNEL_METADATA_TEST='1';
const file=resolve('scripts/internal-projects/personnel-issuer.test.mjs');let wrapper=readFileSync(file,'utf8');
wrapper=wrapper.replace("new URL('./accepted-rate-provenance.test.mjs',import.meta.url)",`new URL('./accepted-rate-provenance.test.mjs',${JSON.stringify(pathToFileURL(file).href)})`);
wrapper=wrapper.replace(/const afterIssuer=.*?;\n/,`const afterIssuer=${JSON.stringify(new URL('./owner-fixture-bridge.mjs',import.meta.url).href)};\n`);
await import('data:text/javascript;base64,'+Buffer.from(wrapper).toString('base64'));
console.log(globalThis.afterMixedSource?'PASS actual mixed source and Finance callback completed':'PASS actual mixed source issuance and correction oracle; Finance acceptance not tested');
