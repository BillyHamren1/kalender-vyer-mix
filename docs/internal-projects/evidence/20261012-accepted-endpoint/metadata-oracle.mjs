// Real metadata sender, claim/finish, Finance Edge/parser and SQL. In-memory HTTP only.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
export async function dispatchActualMetadata({odb,db,operationsRoot,financeRoot,issuer,secret}){
 financeRoot=process.env.FINANCE_METADATA_SOURCE_ROOT??new URL('../recovery-finance-customer/',import.meta.url).pathname.replace(/\/$/,'');
 const ts=createRequire(operationsRoot+'/package.json')('typescript');
 const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const helper=uri(transpile(readFileSync(financeRoot+'/supabase/functions/_shared/operations-project-metadata-contract.ts','utf8')));
 const env=new Map(Object.entries({OPERATIONS_METADATA_ENABLED:'true',OPERATIONS_METADATA_ISSUER:issuer,OPERATIONS_METADATA_SIGNING_SECRET:secret,SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'}));
 let receiver;globalThis.Deno={env:{get:k=>env.get(k)},serve:fn=>receiver=fn};
 globalThis.metadataTestClient={rpc:async(name,a)=>{assert.equal(name,'finance_receive_operations_metadata_v1');try{await db.exec('SET ROLE service_role');const r=await db.query('select finance_receive_operations_metadata_v1($1,$2,$3,$4,$5) result',[a.p_issuer,a.p_timestamp,a.p_nonce,a.p_signature,a.p_raw_body]);return{data:r.rows[0].result,error:null}}catch(e){return{data:null,error:{message:e.message}}}finally{await db.exec('RESET ROLE')}}};
 let edge=readFileSync(financeRoot+'/supabase/functions/operations-project-metadata/index.ts','utf8');
 const clientImport='import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";';
 assert.ok(edge.includes(clientImport),'Actual Finance Edge import changed');
 edge=edge.replace(clientImport,'const createClient=()=>globalThis.metadataTestClient;').replace('../_shared/operations-project-metadata-contract.ts',helper);
 await import(uri(transpile(edge)));assert.equal(typeof receiver,'function');
 const sender=await import(uri(transpile(readFileSync(operationsRoot+'/supabase/functions/dispatch-project-metadata/handler.ts','utf8'))));
 const handler=sender.createHandler({config:{enabled:true,triggerSecret:secret,issuer,signingSecret:secret,destinationUrl:'https://finance.example.invalid/metadata',allowedUrl:'https://finance.example.invalid/metadata'},
 claim:async()=>{await odb.exec('SET ROLE service_role');try{return(await odb.query('select claim_operations_project_metadata_delivery() c')).rows[0].c}finally{await odb.exec('RESET ROLE')}},
 finish:async(t,a,f)=>{await odb.exec('SET ROLE service_role');try{return(await odb.query('select finish_operations_project_metadata_delivery($1,$2,$3) ok',[t,a,f])).rows[0].ok}finally{await odb.exec('RESET ROLE')}},
 fetch:(url,init)=>receiver(new Request(url,init))});
 const expected=Number((await odb.query('select count(*)::int n from operations_project_metadata_outbox')).rows[0].n);
 for(let n=0;n<expected;n++){
  const response=await handler(new Request('https://ops.example.invalid',{method:'POST',headers:{authorization:'Bearer '+secret}}));
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.delivered,true,JSON.stringify(result));
 }
 assert.equal((await odb.query('select count(*)::int n from operations_project_metadata_delivery where delivered_at is not null')).rows[0].n,expected);
 return expected;
}
