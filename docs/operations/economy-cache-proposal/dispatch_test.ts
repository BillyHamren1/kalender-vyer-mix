import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { dispatchEconomyRefresh, EconomyDispatchError } from './dispatch.ts';
Deno.test('dispatch chunks all 501 bookings and preserves tenant on every request', async () => {
  const chunks: number[] = [];
  const orgs: string[] = [];
  await dispatchEconomyRefresh({ organizationId: 'org-a', bookingIds: Array.from({length:501},(_,i) => `b-${i}`), url:'unused', serviceKey:'synthetic',
    request: async (_url, options) => {
      const body = JSON.parse(String(options?.body)); chunks.push(body.booking_ids.length); orgs.push(body.organization_id);
      return new Response(JSON.stringify({refreshed:body.booking_ids.length}));
    } });
  assertEquals(chunks,[200,200,101]); assertEquals(orgs,['org-a','org-a','org-a']);
});
Deno.test('HTTP failure retries only its affected chunk and surfaces exact failed IDs', async () => {
  const calls: string[][] = [];
  const error = await assertRejects(() => dispatchEconomyRefresh({ organizationId:'org-a',bookingIds:['a','b'],url:'unused',serviceKey:'synthetic',
    request: async (_url, options) => { calls.push(JSON.parse(String(options?.body)).booking_ids); return new Response('{}',{status:503}); }
  }), EconomyDispatchError);
  assertEquals(calls,[['a','b'],['a','b']]); assertEquals((error as EconomyDispatchError).bookingIds,['a','b']);
});
Deno.test('an incomplete 200 response is retryable, never fabricated success', async () => {
  await assertRejects(() => dispatchEconomyRefresh({ organizationId:'org-a',bookingIds:['a'],url:'unused',serviceKey:'synthetic',
    request: async () => new Response(JSON.stringify({refreshed:0}))
  }), EconomyDispatchError);
});
