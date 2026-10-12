// Actual index/shared modules; only Deno environment and Supabase network are fixture ports.
import vm from 'node:vm';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{resolve}from'node:path';import{createRequire}from'node:module';import{webcrypto}from'node:crypto';
export async function prepareActualEndpoint({db,operationsRoot,issuer,epoch,sourceOrg,org,secret,metadataSecret}){
 const root=resolve(process.env.FINANCE_ENDPOINT_SOURCE_ROOT??'../recovery-finance-endpoint'),ts=createRequire(operationsRoot+'/package.json')('typescript');
 await db.exec(readFileSync(root+'/scripts/internal-projects/accepted-cost-ingress.sql','utf8'));
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.finance_receive_operations_accepted_cost_v1(text,text,uuid,text)','EXECUTE') v",[role])).rows[0].v,false);
 await db.exec('grant execute on function public.finance_receive_operations_accepted_cost_v1(text,text,uuid,text) to service_role');
 const compile=path=>ts.transpileModule(readFileSync(root+'/'+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const shared={exports:{}};vm.runInNewContext(compile('supabase/functions/_shared/operations-accepted-cost-receive.ts'),{module:shared,exports:shared.exports,TextEncoder,TextDecoder,crypto:webcrypto,Response,Request,setTimeout,clearTimeout});
 const env={OPERATIONS_ACCEPTED_COST_ENABLED:'true',OPERATIONS_ACCEPTED_COST_ISSUER_ID:issuer,OPERATIONS_ACCEPTED_COST_ENROLLMENT_EPOCH:epoch,OPERATIONS_ACCEPTED_COST_SOURCE_ORGANIZATION_ID:sourceOrg,OPERATIONS_ACCEPTED_COST_DESTINATION_ORGANIZATION_ID:org,OPERATIONS_ACCEPTED_COST_SIGNING_SECRET:secret,OPERATIONS_METADATA_SIGNING_SECRET:metadataSecret,SUPABASE_URL:'https://synthetic.supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'isolated-own-db-client-only'};
 let handler,calls=0;
 vm.runInNewContext(compile('supabase/functions/operations-personnel-accepted-receive/index.ts'),{exports:{},URL,Request,Response,Deno:{env:{get:k=>env[k]},serve:h=>handler=h},require:n=>n.includes('supabase-js')?{createClient:(url,key,options)=>{assert.equal(url,env.SUPABASE_URL);assert.equal(key,env.SUPABASE_SERVICE_ROLE_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false}});return{rpc:async(name,a)=>{
  calls++;assert.equal(name,'finance_receive_operations_accepted_cost_v1');assert.deepEqual(Object.keys(a).sort(),['p_nonce','p_raw_body','p_signature','p_timestamp']);
  try{await db.exec('set role service_role');const result=(await db.query('select public.finance_receive_operations_accepted_cost_v1($1,$2,$3,$4) r',[a.p_raw_body,a.p_timestamp,a.p_nonce,a.p_signature])).rows[0].r;return{data:result,error:null};}
  catch(e){return{data:null,error:{code:e.code,message:e.message}};}finally{await db.exec('reset role');}
 }}}}:shared.exports});
 assert.equal(typeof handler,'function');
 // Invalid signatures must stop before any SQL/client call. Actual signed requests follow via caller sender.
 const before=calls;const invalid=await handler(new Request('https://finance.example.invalid',{method:'POST',body:'{}'}));assert.equal(invalid.status,403);assert.equal(calls,before);
 console.log('ENDPOINT PASS actual index rejects unsigned request before SQL; public ingress defaults revoked');
 let checked=false;
 return async request=>{if(!checked){checked=true;const raw=await request.clone().text(),headers=new Headers(request.headers),count=calls;
  const tampered=await handler(new Request(request.url,{method:'POST',headers,body:raw+' '}));assert.equal(tampered.status,403);assert.equal(calls,count);
  headers.set('x-eventflow-timestamp','1000000000');const stale=await handler(new Request(request.url,{method:'POST',headers,body:raw}));assert.equal(stale.status,403);assert.equal(calls,count);
  console.log('ENDPOINT PASS actual index rejects raw-byte tampering and stale timestamp before SQL');
 }const response=await handler(request);assert.equal(response.headers.get('cache-control'),'no-store');return response;};
}
