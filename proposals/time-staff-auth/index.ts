// Deno entry for time-staff-auth. To activate (after review): copy this folder to
// supabase/functions/time-staff-auth/, set verify_jwt=false (server-to-server,
// shared-secret auth), apply rate_limit.sql, set TIME_OPERATIONS_AUTH_SHARED_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkSharedSecret, escapeLike, handle, SECRET_HEADER, MAX_BODY_BYTES, type Deps } from './core.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

Deno.serve(async (req) => {
  // No CORS: browsers must never call this endpoint.
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const denied = checkSharedSecret(Deno.env.get('TIME_OPERATIONS_AUTH_SHARED_SECRET'), req.headers.get(SECRET_HEADER));
  if (denied) return reply(denied.status, denied.body);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: 'unsupported_media_type' });
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });

  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(503, { error: 'not_configured' });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const must = <T>(r: { data: T | null; error: unknown }): T => { if (r.error) throw new Error('db'); return (r.data ?? []) as T; };

  const deps: Deps = {
    findStaffIdsByEmail: async (e) => must(await db.from('staff_members').select('id, email').ilike('email', escapeLike(e)).limit(3)),
    findAccountsByStaffId: async (id) => must(await db.from('staff_accounts').select('staff_id, organization_id, username, password_hash').eq('staff_id', id).limit(3)),
    findAccountsByUsername: async (u) => must(await db.from('staff_accounts').select('staff_id, organization_id, username, password_hash').eq('username', u).limit(3)),
    getStaff: async (id) => { const r = await db.from('staff_members').select('id, organization_id, name, email, is_active').eq('id', id).maybeSingle(); if (r.error) throw new Error('db'); return r.data; },
    consumeRateLimit: async (bucket) => { const r = await db.rpc('time_staff_auth_consume', { p_bucket: bucket }); if (r.error) throw new Error('rl'); return r.data === true; },
    sha256Hex: async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join(''),
  };

  try {
    const raw = await req.text();
    const result = await handle(deps, raw);
    return reply(result.status, result.body);
  } catch {
    // Never log request bodies, identifiers or secrets.
    console.error('[time-staff-auth] internal_error');
    return reply(503, { schema: 'time-operations-auth.v1', error: 'unavailable' });
  }
});
