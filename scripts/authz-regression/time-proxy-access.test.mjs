import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const sourceOrg='f5e5cade-f08b-4833-a105-56461f15b191';
const timeOrg='c2a94d3e-6b71-4f28-8e5a-9d0c3b7f1a22';
const otherOrg='10000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000001';
const read=async path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const code=async path=>stripTypeScriptTypes(await read(path), { mode: 'transform' }).replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*$/gm,'').replace(/^export /gm,'');
const shared=await code('supabase/functions/_shared/planningAccess.ts')+'\n'+await code('supabase/functions/_shared/time-v2/lagerContextExport.ts')+'\n'+await code('supabase/functions/time-planning-proxy/access.ts');
const endpoint=await code('supabase/functions/time-planning-proxy/index.ts');

async function fixture({selected=sourceOrg,roles=[{user_id:actor,organization_id:sourceOrg,role:'projekt'}],target,profileError=false,roleError=false,validAuth=true,moduleAllowed=true,moduleError=false}={}) {
  const calls=[],sent=[],handled=[],signed=[];let handler;
  const admin={auth:{getUser:async()=>({data:{user:validAuth?{id:actor}:null},error:null})},
    rpc:async(name,args)=>{assert.equal(name,'hub_module_access_allowed');assert.deepEqual(args,{_local_user_id:actor,_organization_id:selected,_module:'planering'});return {data:moduleAllowed,error:moduleError?{message:'unavailable'}:null};},
    from:table=>{assert.ok(['profiles','user_roles'].includes(table));const predicates=[];
      const q={select:()=>q,eq:(k,v)=>{predicates.push(row=>row[k]===v);calls.push([table,k,v]);return q;},
        in:(k,v)=>{predicates.push(row=>v.includes(row[k]));return q;},limit:()=>q,
        maybeSingle:async()=>({data:table==='profiles'?{organization_id:selected}:roles.find(row=>predicates.every(p=>p(row)))??null,error:(table==='profiles'?profileError:roleError)?{message:'unavailable'}:null})};return q;}};
  const env={SUPABASE_URL:'https://planning.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',TIME_ADAPTER_URL:'https://time.example.invalid/functions/v1',TIME_ADAPTER_SIGNING_SEED:'fixture-seed',TIME_ADAPTER_ORGANIZATION_ID:target};
  const ports={Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},createClient:()=>admin,corsHeaders:{},
    deriveSigningKeyFromSeed:async()=>{signed.push('sign');return {key:'fixture',keyId:'fixture'};},buildServiceProofClaims:x=>x,sha256Hex:async()=> 'fixture',signServiceProofJwt:async()=> 'fixture',SERVICE_PROOF_HEADER:'x-planning-service-proof',
    handleLagerContextImport:async x=>{handled.push({kind:'lager',...x});return Response.json({ok:true});},
    handleWorkerAssignmentSync:async x=>{handled.push({kind:'worker',...x});return Response.json({ok:true});},
    handleWorkerAssignmentPush:async x=>{handled.push({kind:'push',...x});return Response.json({ok:true});},
    EXPENSE_PROXY_OPERATIONS:new Set(['expenses.list']),handleExpenseOperation:async x=>{handled.push({kind:'expense',...x});return {status:200,body:{ok:true}};},
    fetch:async(_url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({adapterVersion:'time-planning-adapter.v2',data:{ok:true}});},console:{log(){}}};
  new Function(...Object.keys(ports),shared+'\n'+endpoint)(...Object.values(ports));
  return {calls,sent,handled,signed,request:(operation='status',body={},headers={})=>handler(new Request('https://planning.example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json',...headers},body:JSON.stringify({operation,...body})}))};
}

test('approved mapping and exact source role preserve generic and expense access',async()=>{
  for(const target of [timeOrg,undefined]) {const f=await fixture({target});assert.equal((await f.request('status',{organizationId:otherOrg})).status,200);assert.equal(f.sent[0].organizationId,timeOrg);assert.ok(f.calls.some(c=>c[0]==='user_roles'&&c[1]==='organization_id'&&c[2]===sourceOrg));}
  const f=await fixture();assert.equal((await f.request('expenses.list')).status,200);assert.equal(f.handled[0].organizationId,sourceOrg);assert.equal(f.handled[0].timeOrganizationId,timeOrg);
});
test('unknown source can never inherit global Time override or caller tenant',async()=>{
  for(const operation of ['status','personnel.list','expenses.list','lager.contextImport','worker.assignments.push']) {
    const f=await fixture({selected:otherOrg,target:timeOrg,roles:[{user_id:actor,organization_id:otherOrg,role:'admin'}]});
    assert.equal((await f.request(operation,{organizationId:sourceOrg})).status,403);assert.deepEqual(f.sent,[]);assert.deepEqual(f.handled,[]);assert.deepEqual(f.signed,[]);
  }
});
test('unknown same-ID target and mismatched configured binding fail closed',async()=>{
  for(const options of [{selected:otherOrg,target:otherOrg,roles:[{user_id:actor,organization_id:otherOrg,role:'admin'}]},{target:otherOrg},{target:''}]) {
    const f=await fixture(options);assert.equal((await f.request()).status,403);assert.deepEqual(f.signed,[]);
  }
});
test('foreign-org role, wrong actor, missing role and non-planning role cannot authorize selected org',async()=>{
  for(const roles of [[],[{user_id:actor,organization_id:otherOrg,role:'admin'}],[{user_id:otherOrg,organization_id:sourceOrg,role:'admin'}],[{user_id:actor,organization_id:sourceOrg,role:'forsaljning'}]]) {
    for(const op of ['status','expenses.list','worker.assignments.push']) {const f=await fixture({roles});assert.equal((await f.request(op)).status,403);assert.deepEqual(f.sent,[]);assert.deepEqual(f.handled,[]);assert.deepEqual(f.signed,[]);}
  }
});
test('profile and role lookup failures deny before signing or forwarding',async()=>{
  for(const options of [{profileError:true},{roleError:true},{selected:null}]){const f=await fixture(options);assert.equal((await f.request()).status,403);assert.deepEqual(f.signed,[]);}
});
test('current exact-org canonical admin/project/warehouse grants authorize planner push',async()=>{
  for(const role of ['admin','projekt','lager']){const f=await fixture({roles:[{user_id:actor,organization_id:sourceOrg,role}]});assert.equal((await f.request('worker.assignments.push')).status,200);assert.equal(f.handled[0].organizationId,sourceOrg);}
});
test('invalid user session cannot reach projection or signing',async()=>{const f=await fixture({validAuth:false});assert.equal((await f.request()).status,401);assert.deepEqual(f.calls,[]);assert.deepEqual(f.signed,[]);});
test('independently verified Time worker and internal service push retain their own auth handlers',async()=>{
  const f=await fixture({validAuth:false,roles:[]});assert.equal((await f.request('worker.assignments.sync')).status,200);assert.equal(f.handled[0].kind,'worker');assert.deepEqual(f.calls,[]);
  const internal=await fixture({validAuth:false,roles:[]});assert.equal((await internal.request('worker.assignments.push',{organizationId:sourceOrg},{'x-planning-internal-key':'fixture-service'})).status,200);assert.equal(internal.handled[0].organizationId,sourceOrg);assert.deepEqual(internal.calls,[]);
});

test('current planering module denial or lookup failure blocks Time despite exact-org role',async()=>{for(const options of [{moduleAllowed:false},{moduleError:true}]){for(const op of ['status','expenses.list','worker.assignments.push']){const f=await fixture(options);assert.equal((await f.request(op)).status,403);assert.deepEqual(f.sent,[]);assert.deepEqual(f.handled,[]);assert.deepEqual(f.signed,[]);}}});
