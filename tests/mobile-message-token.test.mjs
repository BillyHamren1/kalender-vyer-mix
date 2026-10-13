import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileMessageToken, verifyMobileMessageClaims } from '../supabase/functions/_shared/mobile-message-token.ts';
const secret='test-only-server-key-never-use-in-production',now=1791800000000;
const claims={staffId:'staff-a',sessionId:'10000000-0000-4000-8000-000000000001',timestamp:now,expiresAt:now+3600000};
test('signed envelope remains readable by existing mobile clients',async()=>{
 const p=JSON.parse(atob(await createMobileMessageToken(claims,secret)));
 assert.equal(p.staffId,claims.staffId);assert.equal(p.sessionId,claims.sessionId);assert.equal(await verifyMobileMessageClaims(p,secret,now),true);
});
test('knowing a server session ID does not permit message-token forgery',async()=>{
 assert.equal(await verifyMobileMessageClaims(claims,secret,now),false);
 const p=JSON.parse(atob(await createMobileMessageToken(claims,secret)));
 for(const [key,value] of [['staffId','staff-b'],['sessionId','20000000-0000-4000-8000-000000000002'],['expiresAt',now+7200000],['timestamp',now-100]]) assert.equal(await verifyMobileMessageClaims({...p,[key]:value},secret,now),false);
 assert.equal(await verifyMobileMessageClaims(p,'another-server-key-long-enough-32-characters',now),false);
 assert.equal(await verifyMobileMessageClaims(p,secret,now+3600000),false);
});
test('missing signing configuration fails closed',async()=>{await assert.rejects(createMobileMessageToken(claims,''));assert.equal(await verifyMobileMessageClaims(claims,''),false);});
