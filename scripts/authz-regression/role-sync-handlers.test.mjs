import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const actor='10000000-0000-4000-8000-000000000001', org='20000000-0000-4000-8000-000000000001';
async function harness(name, { rpcFailure=false, hubDenied=false }={}) {
  const source=await readFile(new URL(`../../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
  const calls=[];
  const authUser={id:actor,email:'fixture@example.invalid',user_metadata:{}};
  const client={
    auth:{admin:{getUserById:async()=>({data:{user:authUser}}),updateUserById:async()=>({}),
      generateLink:async()=>{calls.push('session');return {data:{properties:{hashed_token:'fixture'}}};}},
      verifyOtp:async()=>({data:{session:{access_token:'synthetic',refresh_token:'synthetic'}}})},
    from: table=>{
      assert.notEqual(table,'user_roles','role writes must use the atomic RPC');
      return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:org}})})}),upsert:async()=>{calls.push({profile:true});return {};}};
    },
    rpc:async(name,args)=>{calls.push({name,args});return rpcFailure?{error:{message:'fixture failure'}}:{data:{ok:true}};},
  };
  let handler;
  const Deno={serve:fn=>{handler=fn;},env:{get:key=>({WEBHOOK_SECRET:'fixture-secret',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-anon'})[key]}};
  const fetch=async()=>new Response(JSON.stringify(hubDenied?{valid:false,error:'DENIED'}:{valid:true,payload:{user_id:actor,organization_id:org,email:authUser.email,roles:['lager']}}),{status:hubDenied?403:200});
  const code=stripTypeScriptTypes(source.replace(/^import .*createClient.*\n/m,''));
  new Function('createClient','Deno','fetch',code)(()=>client,Deno,fetch);
  return {calls,invoke:(body,authorized=true)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(authorized?{'x-webhook-secret':'fixture-secret'}:{})},body:JSON.stringify(body)}))};
}
test('SSO uses HUB revalidated role set and completes atomic replacement before session issuance',async()=>{
 const h=await harness('verify-sso-token');
 const r=await h.invoke({payload:{roles:['admin']},signature:'fixture'});
 assert.equal(r.status,200);
 const rpc=h.calls.find(x=>x.name);
 assert.deepEqual(rpc,{name:'replace_hub_role_projection',args:{_user_id:actor,_organization_id:org,_roles:['lager']}});
 assert.ok(h.calls.indexOf(rpc)<h.calls.indexOf('session'));
});
test('SSO refuses to issue session if atomic role sync fails',async()=>{
 const h=await harness('verify-sso-token',{rpcFailure:true});
 assert.equal((await h.invoke({payload:{},signature:'fixture'})).status,500);
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
 assert.deepEqual(h.calls.find(x=>x.name).args,{_user_id:actor,_organization_id:org,_roles:['lager']});
});
test('empty authoritative role set revokes without changing profile context',async()=>{
 const h=await harness('receive-user-sync');
 const r=await h.invoke({user_id:actor,organization_id:org,email:'fixture@example.invalid',roles:[]});
 assert.equal(r.status,200); assert.equal((await r.json()).revoked,true);
 assert.deepEqual(h.calls,[{name:'replace_hub_role_projection',args:{_user_id:actor,_organization_id:org,_roles:[]}}]);
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
