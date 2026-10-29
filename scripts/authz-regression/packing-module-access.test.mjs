import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../../supabase/functions/_shared/packingModuleAccess.ts',import.meta.url),'utf8');
const {canMutatePacking,hasHubPackingGate}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));
function fixture(roles,gates={planering:true,lager:true},error=null){
 const filters=[];const calls=[];
 const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},then:resolve=>Promise.resolve({data:roles.map(role=>({role})),error}).then(resolve)};
 return {filters,calls,from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return {data:gates[args._module],error:null}}};
}
test('each command requires scoped live role and its exact HUB module',async()=>{
 const admin=fixture(['admin','lager'],{planering:true,lager:false});
 assert.equal(await canMutatePacking(admin,'user','org','lager'),false);
 assert.equal(await canMutatePacking(admin,'user','org','planering'),true);
 assert.deepEqual(admin.filters.slice(0,2),[['user_id','user'],['organization_id','org']]);
 assert.equal(admin.calls[0].args._module,'lager');
 const warehouse=fixture(['lager'],{planering:false,lager:true});
 assert.equal(await canMutatePacking(warehouse,'user','org','lager'),true);
 assert.equal(await canMutatePacking(warehouse,'user','org','planering'),false);
});
test('missing roles, metadata, database errors and transport failures cannot grant',async()=>{
 for(const admin of [fixture([]),fixture(['projekt']),fixture(['admin'],undefined,{message:'offline'})]){
  admin.user_metadata={role:'admin'};
  assert.equal(await canMutatePacking(admin,'user','org','lager'),false);
 }
 for(const result of [{data:'true',error:null},{data:true,error:{message:'offline'}},{data:null,error:null}]){
  const admin=fixture(['admin']);admin.rpc=async()=>result;
  assert.equal(await canMutatePacking(admin,'user','org','lager'),false);
 }
 const admin=fixture(['admin']);admin.rpc=async()=>{throw Error('offline')};
 assert.equal(await canMutatePacking(admin,'user','org','lager'),false);
});
test('shared sync accepts either canonical module, never neither',async()=>{
 assert.equal(await hasHubPackingGate(fixture(['admin'],{planering:false,lager:false}),'user','org',['planering','lager']),false);
 assert.equal(await hasHubPackingGate(fixture(['admin'],{planering:true,lager:false}),'user','org',['planering','lager']),true);
});
