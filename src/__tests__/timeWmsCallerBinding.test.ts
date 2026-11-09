import {describe,expect,it} from 'vitest';
import {buildTimeWmsProjectionRequest,fetchTimeWmsProjection,hmacSha256Hex} from '../../supabase/functions/_shared/timeWmsProjection';
describe('Planning caller binding',()=>{
  it.each(['isolated-shared-caller-key','isolated-distinct-planning-key'])('binds identity with fixture key %s',async(hmacSecret)=>{
    let calls=0;
    const request=buildTimeWmsProjectionRequest({bookingId:'booking-fixture',bookingNumber:'fixture-number',deviceId:'planning-service:operations-booking-sync',actor:{kind:'service',serviceId:'operations-booking-sync',organizationId:'33333333-3333-4333-8333-333333333333',label:'Operations booking sync'}});
    const result=await fetchTimeWmsProjection(request,{hmacSecret,now:()=>new Date('2026-11-09T03:00:00Z'),nonce:()=> 'isolatednonce1234',fetchImpl:(async(_url,init)=>{
      calls++;
      const headers=new Headers(init?.headers),body=String(init?.body);
      expect(headers.get('x-time-caller')).toBe('planning');
      expect(headers.get('x-time-signature')).toBe(await hmacSha256Hex(hmacSecret,'time-wms-caller.v1:planning:'+headers.get('x-time-timestamp')+'.isolatednonce1234.'+body));
      expect(headers.get('x-time-signature')).not.toBe(await hmacSha256Hex(hmacSecret,headers.get('x-time-timestamp')+'.isolatednonce1234.'+body));
      return new Response(JSON.stringify({error:'unauthorized'}),{status:401});
    }) as typeof fetch});
    expect(result).toMatchObject({ok:false,code:'wms_unavailable'});
    expect(calls).toBe(1); // No downgrade to legacy MAC after rejection.
  });
});

