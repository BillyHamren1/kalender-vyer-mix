import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fetchEconomyBatch, hasValidProductCosts } from './economy-fetch.ts';

Deno.test('product_costs HTTP-fel blir explicit och batchen är inte cachebar', async () => {
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('type=product_costs')) {
      return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 500 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  const batch = await fetchEconomyBatch(fakeFetch, 'https://booking.example', 'secret', 'booking-a');
  assertEquals(batch.product_costs, null);
  assertEquals(batch._errors?.product_costs, { code: 'upstream_http_error', status: 500 });
  assert(!hasValidProductCosts(batch));
});

Deno.test('giltigt product_costs-svar är cachebart', async () => {
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const payload = url.includes('type=product_costs') ? { summary: { revenue: 17158 } } : [];
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const batch = await fetchEconomyBatch(fakeFetch, 'https://booking.example', 'secret', 'booking-a');
  assert(hasValidProductCosts(batch));
  assertEquals(batch._errors, undefined);
});
