import {describe,it,expect} from 'vitest';
import {createHmac} from 'node:crypto';
import {dispatchAcceptedPersonnelClaim,verifyAcceptedPersonnelAcknowledgement,type AcceptedPersonnelClaim} from './project-personnel-accepted-transport.ts';
import {rawBodySha256} from './project-personnel-ingestion-transport.ts';
const secret='disposable-accepted-delivery-key-not-source-issuer';
const endpoint='https://finance.example.invalid/functions/v1/operations-personnel-accepted-receive';
const claim=async():Promise<AcceptedPersonnelClaim>=>({id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',source_time_stream_id:'time:fixture:2026-10-01',source_revision:7,raw_body:'{ "source": "exact bytes" }',body_sha256:await rawBodySha256('{ "source": "exact bytes" }'),destination_organization_id:'33333333-3333-4333-8333-333333333333',issuer_id:'44444444-4444-4444-8444-444444444444',enrollment_epoch:'55555555-5555-4555-8555-555555555555',endpoint_url:endpoint,lease_owner:'fixture-worker',lease_token:'66666666-6666-4666-8666-666666666666'});
const config=(c:AcceptedPersonnelClaim)=>({enabled:true,endpoint,issuerId:c.issuer_id,enrollmentEpoch:c.enrollment_epoch,secret});
const ack=(c:AcceptedPersonnelClaim,extra:Record<string,unknown>={})=>{const raw_ack=JSON.stringify({schema:'operations-personnel-accepted-receipt.v1',outcome:'received',issuer_id:c.issuer_id,enrollment_epoch:c.enrollment_epoch,source_organization_id:c.organization_id,destination_organization_id:c.destination_organization_id,source_stream_id:c.source_time_stream_id,source_revision:c.source_revision,outbox_id:c.id,envelope_sha256:c.body_sha256,receipt_id:'77777777-7777-4777-8777-777777777777',financially_applied:false,...extra});return{raw_ack,signature:createHmac('sha256',secret).update('operations-personnel-accepted-ack.v1\n'+raw_ack).digest('hex')}};
describe('accepted evidence transport, no financial posting',()=>{
 it('disabled transport emits no HTTP',async()=>{const c=await claim();let calls=0;expect(await dispatchAcceptedPersonnelClaim(c,{...config(c),enabled:false},async()=>{calls++;throw new Error()})).toEqual({outcome:'blocked',error:'accepted_transport_disabled'});expect(calls).toBe(0)});
 it('binds exact bytes, route, issuer and epoch in separate request domain with fresh retry nonce',async()=>{
  const c=await claim(),nonces:string[]=[];
  for(let i=0;i<2;i++){const result=await dispatchAcceptedPersonnelClaim(c,config(c),async(url,init)=>{expect(String(url)).toBe(endpoint);expect(init?.body).toBe(c.raw_body);expect(init?.redirect).toBe('error');
   const h=new Headers(init?.headers);nonces.push(h.get('x-eventflow-nonce')!);
   expect(h.get('x-eventflow-signature')).toBe(createHmac('sha256',secret).update(['operations-personnel-accepted-delivery.v1','operations-personnel-accepted-receive',h.get('x-eventflow-timestamp'),h.get('x-eventflow-nonce'),c.issuer_id,c.enrollment_epoch,c.raw_body].join('\n')).digest('hex'));
   return new Response(JSON.stringify(ack(c,{outcome:i?'replayed':'received'})),{status:200});});expect(result.outcome).toBe('delivered');}
  expect(nonces[0]).not.toBe(nonces[1]);
 });
 it('requires exact independently signed evidence-only ACK',async()=>{const c=await claim();await expect(verifyAcceptedPersonnelAcknowledgement(ack(c),c,secret)).resolves.toBeTruthy();
  for(const change of [{outcome:null},{financially_applied:true},{source_revision:8},{envelope_sha256:'0'.repeat(64)},{enrollment_epoch:null},{source_organization_id:null},{destination_organization_id:null},{source_stream_id:null},{outbox_id:null},{receipt_id:null},{extra:'x'}])await expect(verifyAcceptedPersonnelAcknowledgement(ack(c,change),c,secret)).rejects.toThrow();
  await expect(verifyAcceptedPersonnelAcknowledgement({...ack(c),signature:'0'.repeat(64)},c,secret)).rejects.toThrow('signature');
  await expect(verifyAcceptedPersonnelAcknowledgement({schema:'operations-personnel-cost-receipt-v1',shadow_only:true},c,secret)).rejects.toThrow();
 });
 it('rejects wrong destination, epoch, hash and oversized envelope before HTTP',async()=>{const c=await claim();for(const mutated of [{...c,endpoint_url:endpoint+'?redirect=1'},{...c,enrollment_epoch:'88888888-8888-4888-8888-888888888888'},{...c,raw_body:c.raw_body+' '},{...c,raw_body:'x'.repeat(524289)}]){let calls=0;const r=await dispatchAcceptedPersonnelClaim(mutated,config(c),async()=>{calls++;throw new Error()});expect(r.outcome).not.toBe('delivered');expect(calls).toBe(0)}});
 it('lost response, truncated and invalid ACK remain retryable without pretending receipt',async()=>{const c=await claim();for(const reply of [()=>{throw new Error('lost after commit')},()=>new Response('{}'),()=>new Response('not JSON'),()=>new Response(JSON.stringify({...ack(c),signature:'0'.repeat(64)}))])expect((await dispatchAcceptedPersonnelClaim(c,config(c),async()=>reply())).outcome).toBe('retry')});
 it('422/409 never become a fabricated stale receipt',async()=>{const c=await claim();for(const status of [401,403,409,422])expect((await dispatchAcceptedPersonnelClaim(c,config(c),async()=>new Response(JSON.stringify(ack(c)),{status}))).outcome).toBe('blocked')});
});
