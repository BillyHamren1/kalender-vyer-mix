import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const base=new URL('../../supabase/functions/',import.meta.url);
const shared=stripTypeScriptTypes(await readFile(new URL('_shared/scannerHubAccess.ts',base),'utf8')).replace(/export /g,'');
const source=await readFile(new URL('scanner-api/index.ts',base),'utf8');
const start=source.indexOf('async function authenticateRequest(');
const end=source.indexOf('// ============================================================================',start);
const code=stripTypeScriptTypes(source.slice(start,end));
const claims={staffId:'staff',sessionId:'session',organizationId:'org'};
const tokenResult={valid:true,claims};
const authenticate=new Function('SCANNER_SIGNED_TOKEN_PREFIX','scannerSigningSecretReady','verifyScannerSignedToken','verifyScannerLegacyToken','scannerReleaseShaReady','scannerReleaseMatches','activeScannerSessionMatches',shared+code+';return authenticateRequest')('efs2',()=>true,async()=>tokenResult,()=>tokenResult,()=>true,()=>true,()=>true);
for(const token of ['efs2.signed','legacy']) {
 test(`${token} current linked authority revoked blocks existing session`,async()=>{
  const calls=[];
  const admin={from:t=>({select:()=>({eq:()=>({single:async()=>({data:{id:'staff',organization_id:'org',active_mobile_session_id:'session'}})})})}),rpc:async(n,args)=>{calls.push({n,args});return {data:false}}};
  await assert.rejects(()=>authenticate(admin,token,'secret','release'),e=>e.status===403&&e.reason==='access_revoked');
  assert.deepEqual(calls,[{n:'scanner_staff_access_allowed',args:{_staff_id:'staff',_organization_id:'org'}}]);
 });
}
test('all seven read/command gateways revalidate before returning actor or forwarding',async()=>{
 for(const name of ['scanner-api','scanner-command-api','scanner-dispatch-api','scanner-inventory-command-api','scanner-inventory-read-api','scanner-return-api','scanner-return-read-api']) {
  const s=await readFile(new URL(name+'/index.ts',base),'utf8');
  assert.ok(s.includes('await scannerStaffAccessAllowed('),name);
  assert.ok(s.indexOf('await scannerStaffAccessAllowed(')<(name==='scanner-api'?s.indexOf('staffId: staffMember.id'):s.indexOf('await fetch(')),name);
 }
 const login=await readFile(new URL('mobile-app-auth/index.ts',base),'utf8');
 assert.ok(login.indexOf('await scannerStaffAccessAllowed(')<login.indexOf('scannerToken = await createScannerSignedToken('));
});
test('permission database failure fails closed',async()=>{
 const allowed=new Function(shared+';return scannerStaffAccessAllowed')();
 assert.equal(await allowed({rpc:async()=>{throw Error('offline')}},'staff','org'),false);
 assert.equal(await allowed({rpc:async()=>({data:true,error:{}})},'staff','org'),false);
});
