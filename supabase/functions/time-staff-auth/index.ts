import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleRequest } from './http.ts';
import { escapeLike, type Deps } from './core.ts';

Deno.serve((req) => handleRequest(req, Deno.env.get('TIME_OPERATIONS_AUTH_SHARED_SECRET'), () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('not_configured');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T>(result: { data: T | null; error: unknown }): T => {
    if (result.error || result.data === null) throw new Error('unavailable');
    return result.data;
  };
  const columns = 'staff_id, organization_id, username, password_hash';
  // Credential lookup must detect duplicates across tenants BEFORE choosing scope.
  // resolve_active and subsequent staff reads use only verified account/request scope.
  const deps: Deps = {
    findStaffIdsByEmail: async (email) => must(await db.from('staff_members')
      .select('id, email').ilike('email', escapeLike(email)).limit(3)),
    findAccountsByStaffId: async (id) => must(await db.from('staff_accounts')
      .select(columns).eq('staff_id', id).limit(3)),
    findAccountsByUsername: async (username) => must(await db.from('staff_accounts')
      .select(columns).eq('username', username).limit(3)),
    getStaff: async (id, organizationId) => {
      const result = await db.from('staff_members').select('id, organization_id, name, email, is_active, tags')
        .eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (result.error) throw new Error('unavailable');
      return result.data;
    },
    consumeRateLimit: async (bucket) => must(await db.rpc('time_staff_auth_consume', { p_bucket: bucket })) === true,
    sha256Hex: async (input) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(input)))).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
  return deps;
}));
