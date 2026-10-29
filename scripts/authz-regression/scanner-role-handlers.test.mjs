import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const actor='10000000-0000-4000-8000-000000000001', org='20000000-0000-4000-8000-000000000001';
async function harness(name, { rpcFailure=false, hubDenied=false, revision="7", stale=false, unmapped=false, createConflict=false, emailCollision=false, listFailure=false, absentOrg=false, gates={planering:true,lager:true} }={}) {
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
  const fetch=async()=>new Response(JSON.stringify(hubDenied?{valid:false,error:'DENIED'}:{valid:true,payload:{user_id:actor,organization_id:org,email:authUser.email,roles:['lager'],source_revision:revision,module_access:gates}}),{status:hubDenied?403:200});
  const shared=stripTypeScriptTypes(await readFile(new URL('../../supabase/functions/_shared/hub-role-projection.ts',import.meta.url),'utf8')).replace(/export /g,'');
  const code=shared+stripTypeScriptTypes(source.replace(/^import .*\n/gm,''));
  new Function('createClient','Deno','fetch',code)(()=>client,Deno,fetch);
  return {calls,invoke:(body,authorized=true)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(authorized?{'x-webhook-secret':'fixture-secret'}:{})},body:JSON.stringify(body)}))};
}
test('SSO uses revalidated module ceiling, never client gates',async()=>{
 const h=await harness('verify-sso-token',{gates:{planering:false,lager:true}});
 const r=await h.invoke({payload:{module_access:{planering:true,lager:true}},signature:'fixture'});
 assert.equal(r.status,403);assert.ok(!h.calls.includes('session'));
 assert.deepEqual(h.calls.find(x=>x.name==='apply_hub_role_projection').args._module_access,{planering:false,lager:true});
});
test('versioned push requires gates before any identity side effects',async()=>{
 const h=await harness('receive-user-sync');
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:['lager'],source_revision:'7'});
 assert.equal(r.status,409); assert.deepEqual(h.calls,[]);
});
test('versioned empty push echoes revision and exact false gates',async()=>{
 const h=await harness('receive-user-sync');
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[],source_revision:'8',module_access:{planering:false,lager:false}});
 assert.equal(r.status,200);assert.equal((await r.json()).source_revision,'8');
 assert.deepEqual(h.calls.find(x=>x.name==='apply_hub_role_projection').args._module_access,{planering:false,lager:false});
});
