import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const actor='10000000-0000-4000-8000-000000000001', org='20000000-0000-4000-8000-000000000001';
async function harness(name, { rpcFailure=false, hubDenied=false, revision="7", stale=false, unmapped=false, createConflict=false, emailCollision=false, listFailure=false, absentOrg=false }={}) {
  const source=await readFile(new URL(`../../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
  const calls=[];
  const authUser={id:actor,email:'fixture@example.invalid',user_metadata:{}};
  const client={
    auth:{admin:{listUsers:async()=>listFailure?{error:{message:'unavailable'}}:{data:{users:emailCollision?[authUser]:[]}},getUserById:async()=>({data:{user:authUser}}),updateUserById:async()=>({}),
      createUser:async()=>{calls.push("create");return createConflict?{error:{message:"email exists"}}:{data:{user:authUser}};},
      generateLink:async()=>{calls.push('session');return {data:{properties:{hashed_token:'fixture'}}};}},
      verifyOtp:async()=>({data:{session:{access_token:'synthetic',refresh_token:'synthetic'}}})},
    from: table=>{
      assert.notEqual(table,'user_roles','role writes must use the atomic RPC');
      return {select:()=>({eq:()=>({maybeSingle:async()=>({data:absentOrg?null:{id:org}})})}),upsert:async()=>{calls.push({profile:true});return {};}};
    },
    rpc:async(name,args)=>{calls.push({name,args});
      if(name==='resolve_hub_actor_v1') return {data:unmapped?{status:'actor_unmapped'}:{status:'ok',localUserId:actor}};
      return rpcFailure?{error:{message:'fixture failure'}}:stale?{data:{ok:false,error:'STALE_SOURCE_REVISION'}}:{data:{ok:true,local_user_id:actor,source_revision:args._source_revision}};
    },
  };
  let handler;
  const Deno={serve:fn=>{handler=fn;},env:{get:key=>({WEBHOOK_SECRET:'fixture-secret',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-anon'})[key]}};
  const fetch=async()=>new Response(JSON.stringify(hubDenied?{valid:false,error:'DENIED'}:{valid:true,payload:{user_id:actor,organization_id:org,email:authUser.email,roles:['lager'],source_revision:revision,module_access:{planering:true,lager:true}}}),{status:hubDenied?403:200});
  const shared=stripTypeScriptTypes(await readFile(new URL('../../supabase/functions/_shared/hub-role-projection.ts',import.meta.url),'utf8')).replace(/export /g,'');
  const code=shared+stripTypeScriptTypes(source.replace(/^import .*\n/gm,''));
  new Function('createClient','Deno','fetch',code)(()=>client,Deno,fetch);
  return {calls,invoke:(body,authorized=true)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(authorized?{'x-webhook-secret':'fixture-secret'}:{})},body:JSON.stringify({...body,...(body.source_revision ? {module_access:{planering:true,lager:true}} : {})})}))};
}
test('SSO uses HUB revalidated role set and completes atomic replacement before session issuance',async()=>{
 const h=await harness('verify-sso-token');
 const r=await h.invoke({payload:{roles:['admin']},signature:'fixture'});
 assert.equal(r.status,200);
 const rpc=h.calls.find(x=>x.name==='apply_hub_role_projection');
 assert.deepEqual(rpc,{name:'apply_hub_role_projection',args:{_hub_user_id:actor,_organization_id:org,_roles:['lager'],_source_revision:'7',_module_access:{planering:true,lager:true}}});
 assert.ok(h.calls.indexOf(rpc)<h.calls.indexOf('session'));
});
test('SSO refuses to issue session if atomic role sync fails',async()=>{
 const h=await harness('verify-sso-token',{rpcFailure:true});
 assert.equal((await h.invoke({payload:{},signature:'fixture'})).status,409);
 assert.ok(!h.calls.includes('session'));
});
test('HUB denial performs no downstream writes',async()=>{
 const h=await harness('verify-sso-token',{hubDenied:true});
 assert.equal((await h.invoke({payload:{},signature:'fixture'})).status,403);
 assert.deepEqual(h.calls,[]);
});
test('authenticated webhook replaces tenant role set atomically',async()=>{
 const h=await harness('receive-user-sync');
 assert.equal((await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:['lager']})).status,200);
 assert.deepEqual(h.calls.find(x=>x.name==='apply_hub_role_projection').args,{_hub_user_id:actor,_organization_id:org,_roles:['lager'],_source_revision:null,_module_access:null});
});
test('empty authoritative role set revokes without changing profile context',async()=>{
 const h=await harness('receive-user-sync');
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[]});
 assert.equal(r.status,200); assert.equal((await r.json()).revoked,true);
 assert.deepEqual(h.calls,[{name:'resolve_hub_actor_v1',args:{_hub_user_id:actor}},{name:'apply_hub_role_projection',args:{_hub_user_id:actor,_organization_id:org,_roles:[],_source_revision:null,_module_access:null}}]);
});
test('missing role list is rejected rather than interpreted as revocation',async()=>{
 const h=await harness('receive-user-sync');
 assert.equal((await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid'})).status,400);
 assert.deepEqual(h.calls,[]);
});
test('unauthenticated webhook cannot mutate any role',async()=>{
 const h=await harness('receive-user-sync');
 assert.equal((await h.invoke({roles:['admin']},false)).status,401);assert.deepEqual(h.calls,[]);
});


test('stale revalidated SSO projection never issues a session',async()=>{
 const h=await harness('verify-sso-token',{stale:true});
 assert.equal((await h.invoke({payload:{source_revision:'999'},signature:'fixture'})).status,409);
 assert.ok(!h.calls.includes('session'));
 assert.ok(!h.calls.some(x=>x.profile));
 const rpc=h.calls.find(x=>x.name==='apply_hub_role_projection');assert.equal(rpc.args._source_revision,'7');
});
test('versioned empty projection records absent identity tombstone via canonical HUB UUID',async()=>{
 const h=await harness('receive-user-sync',{unmapped:true});
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[],source_revision:'9007199254740993'});
 assert.equal(r.status,200);assert.equal((await r.json()).source_revision,'9007199254740993');
 assert.deepEqual(h.calls,[{name:'resolve_hub_actor_v1',args:{_hub_user_id:actor}},{name:'apply_hub_role_projection',args:{_hub_user_id:actor,_organization_id:org,_roles:[],_source_revision:'9007199254740993',_module_access:{planering:true,lager:true}}}]);
});
test('number or malformed revision is rejected before any mutation',async()=>{
 for(const revision of [1,'01','-1','9223372036854775808']) {
  const h=await harness('receive-user-sync');
  assert.equal((await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:['lager'],source_revision:revision})).status,400);
  assert.deepEqual(h.calls,[]);
 }
});
test('email conflict cannot adopt an unrelated local identity',async()=>{
 const h=await harness('receive-user-sync',{unmapped:true,createConflict:true});
 assert.equal((await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:['lager'],source_revision:'7'})).status,409);
 assert.ok(!h.calls.some(x=>x.name==='apply_hub_role_projection'));
});

test('unmapped email conflict or lookup failure cannot falsely acknowledge revocation',async()=>{
 for(const options of [{emailCollision:true},{listFailure:true}]) {
  const h=await harness('receive-user-sync',{unmapped:true,...options});
  assert.equal((await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[],source_revision:'8'})).status,409);
  assert.ok(!h.calls.some(x=>x.name==='apply_hub_role_projection'));
 }
});
test('absent organization still permits canonical revocation tombstone',async()=>{
 const h=await harness('receive-user-sync',{unmapped:true,absentOrg:true});
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[],source_revision:'8'});
 assert.equal(r.status,200);assert.equal((await r.json()).source_revision,'8');
});
