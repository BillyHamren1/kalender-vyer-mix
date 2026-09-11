// Central sink for critical client crashes.
// Auth: the caller's own JWT. Organisation is resolved server-side from profiles.
// Never stores tokens/secrets — payload is redacted before insert.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';

const MAX_TEXT = 4000;

function clip(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const SECRET_PATTERN = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})|(sb-[A-Za-z0-9_-]{8,}-auth-token)|(refresh_token|access_token|apikey|api_key|password|secret)\s*[:=]\s*"?[^"\s,}]+/gi;

function redact(input: string): string {
  return input.replace(SECRET_PATTERN, '[redacted]');
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (typeof value === 'string') return redact(value).slice(0, MAX_TEXT);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (/token|secret|password|apikey|api_key|authorization/i.test(key)) continue;
      out[key] = redactDeep(raw, depth + 1);
    }
    return out;
  }
  return null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { ok: false, error: 'unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json(401, { ok: false, error: 'unauthorized' });
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const code = clip(body?.code, 120);
    const source = clip(body?.source, 120);
    const message = clip(body?.message, MAX_TEXT);
    if (!code || !source || !message) return json(400, { ok: false, error: 'invalid_payload' });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    const severityRaw = clip(body?.severity, 20) ?? 'error';
    const severity = ['info', 'warning', 'error', 'critical'].includes(severityRaw) ? severityRaw : 'error';

    const { error: insertError } = await admin.from('client_diagnostics').insert({
      organization_id: profile?.organization_id ?? null,
      user_id: userId,
      code,
      source,
      severity,
      message: redact(message),
      route: clip(body?.route, 300),
      platform: clip(body?.platform, 60),
      app_mode: clip(body?.appMode, 60),
      fingerprint: clip(body?.fingerprint, 500),
      metadata: (redactDeep(body?.metadata ?? {}) ?? {}) as Record<string, unknown>,
    });

    if (insertError) {
      console.error('[report-diagnostic] insert failed', insertError.message);
      return json(500, { ok: false, error: 'insert_failed' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('[report-diagnostic] unexpected', err);
    return json(500, { ok: false, error: 'unexpected_error' });
  }
});
