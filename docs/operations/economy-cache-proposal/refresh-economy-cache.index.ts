// Intern: uppdaterar lagrad ekonomi för bokningar som Booking just ändrat.
// Anropas endast av import-bookings med service role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshEconomyCache } from './economyCache.ts';

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const efUrl = Deno.env.get('EF_SUPABASE_URL');
  const apiKey = Deno.env.get('PLANNING_API_KEY');
  if (!efUrl || !apiKey) return new Response(JSON.stringify({ error: 'config' }), { status: 500 });

  const body = await req.json().catch(() => ({}));
  const orgId = typeof body.organization_id === 'string' && UUID.test(body.organization_id) ? body.organization_id : null;
  const ids = Array.isArray(body.booking_ids)
    ? [...new Set(body.booking_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)))] as string[]
    : [];
  if (!orgId || ids.length === 0) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  // Tenant-scope: bara bokningar som tillhör organisationen.
  const { data, error } = await db.from('bookings').select('id').eq('organization_id', orgId).in('id', ids);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const allowed = (data ?? []).map((b: { id: string }) => b.id);
  let fresh;
  try { fresh = await refreshEconomyCache(db, efUrl, apiKey, orgId, allowed); }
  catch (error) { return new Response(JSON.stringify({ error: String(error), retryable: true }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  return new Response(JSON.stringify({ refreshed: Object.keys(fresh).length }), { headers: { 'Content-Type': 'application/json' } });
});
