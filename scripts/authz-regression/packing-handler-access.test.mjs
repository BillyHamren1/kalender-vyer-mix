import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const helper=await readFile(new URL('../../supabase/functions/_shared/packingModuleAccess.ts',import.meta.url),'utf8');
async function invoke(name,mode,gates){
 let handler;const effects=[];const modules=[];
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{organization_id:'org'}}),then:resolve=>Promise.resolve({data:[{role:'admin'}],error:null}).then(resolve)};
 const admin={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:table=>{if(!['profiles','user_roles'].includes(table))effects.push(table);return q;},rpc:async(name,args)=>{if(name!=='hub_module_access_allowed')effects.push(name);modules.push(args._module);return {data:gates[args._module],error:null}}};
 const source=(await readFile(new URL('../../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')).replace(/^import .*$/gm,'');
 const js=stripTypeScriptTypes(helper.replace(/export /g,'')+'\n'+source,{mode:'transform'});
 new Function('Deno','createClient','repairPackingItems',js)({serve:fn=>{handler=fn},env:{get:()=>''}},()=>admin,()=>{effects.push('repair');return {ok:true}});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({packing_id:'packing',item_id:'item',mode})}));
 return {response,effects,modules};
}
test('actual handlers reject revoked Warehouse before reading or writing packing data',async()=>{
 for(const name of ['repair-packing-items','apply-packing-change-request','edit-packing-list']){
  const {response,effects,modules}=await invoke(name,'set_packable',{planering:true,lager:false});
  assert.equal(response.status,403,name);assert.deepEqual(effects,[],name);assert.deepEqual(modules,['lager'],name);
 }
});
test('actual planning exclude/restore require Planning, even with Warehouse retained',async()=>{
 for(const mode of ['exclude','restore']){
  const {response,effects,modules}=await invoke('edit-packing-list',mode,{planering:false,lager:true});
  assert.equal(response.status,403);assert.deepEqual(effects,[]);assert.deepEqual(modules,['planering']);
 }
});
