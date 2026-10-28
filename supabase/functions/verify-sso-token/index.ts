// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';
import { applyHubProjection, sourceRevision } from '../_shared/hub-role-projection.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUB_VERIFY_URL = 'https://dmhuzjefqiqwafdtcipt.supabase.co/functions/v1/verify-sso-token';
type TargetView = 'planning' | 'warehouse';
type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function expectedModule(targetView: TargetView): 'planering' | 'lager' {
  return targetView === 'warehouse' ? 'lager' : 'planering';
}

function mapRoles(roles: unknown): AppRole[] {
  if (!Array.isArray(roles)) return [];
  const result = new Set<AppRole>();
  for (const role of roles) {
    if (role === 'superadmin' || role === 'admin') result.add('admin');
    else if (role === 'forsaljning' || role === 'projekt' || role === 'lager') result.add(role);
  }
  return [...result];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createUserSession(
  admin: any,
  anon: any,
  email: string,
  trace: (name: string, extra?: Record<string, unknown>) => void,
) {
  const maxAttempts = 6;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    trace('generate_link', { email_domain: email.split('@')[1] ?? null, attempt });
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !linkData?.properties?.hashed_token) {
      return { session: null, error: linkError ?? new Error('no hashed_token in generateLink response') };
    }
    trace('generate_link_ok', { attempt });

    const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    if (!verifyError && sessionData?.session) {
      trace('verify_otp_ok', { attempt });
      return { session: sessionData.session, error: null };
    }

    lastError = verifyError ?? new Error('no session in verifyOtp response');
    const retryable = verifyError?.code === 'otp_expired' || verifyError?.status === 403;
    if (!retryable || attempt === maxAttempts) break;

    // Hub can open several Planning and Warehouse frames simultaneously.
    // Each newly generated magic link invalidates the preceding link for the
    // same user, so use increasing full jitter before generating a fresh one.
    trace('verify_otp_retry', { attempt, code: verifyError?.code ?? null });
    await delay(150 * attempt + Math.floor(Math.random() * 350 * attempt));
  }

  return { session: null, error: lastError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, error_code: 'METHOD_NOT_ALLOWED' });

  // Trace id so every step of one login attempt can be followed in the logs.
  const traceId = crypto.randomUUID().slice(0, 8);
  let step = 'init';
  const trace = (name: string, extra: Record<string, unknown> = {}) => {
    step = name;
    console.log('[SSO] step', JSON.stringify({ trace_id: traceId, step: name, ...extra }));
  };
  const failure = (name: string, err: unknown) => {
    const e = err as any;
    console.error('[SSO] step_failed', JSON.stringify({
      trace_id: traceId,
      step: name,
      status: e?.status ?? null,
      code: e?.code ?? e?.name ?? null,
      message: typeof e?.message === 'string' ? e.message : JSON.stringify(e?.message ?? e ?? null),
    }));
  };

  try {
    const { payload: incomingPayload, signature, target_view } = await req.json();
    const targetView: TargetView = target_view === 'warehouse' ? 'warehouse' : 'planning';
    if (!incomingPayload || !signature) return json(400, { success: false, error_code: 'MISSING_DATA', trace_id: traceId });

    trace('hub_verify_request', { target_view: targetView, expected_module: expectedModule(targetView) });


    const hubResponse = await fetch(HUB_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: incomingPayload,
        signature,
        expected_module: expectedModule(targetView),
      }),
    });
    const hubResult = await hubResponse.json().catch(() => ({}));
    if (!hubResponse.ok || hubResult?.valid !== true || !hubResult?.payload) {
      failure('hub_verify', { status: hubResponse.status, code: hubResult?.error, message: hubResult?.message });
      return json(hubResponse.status || 401, {
        success: false,
        error_code: hubResult?.error || 'HUB_VERIFY_FAILED',
        message: hubResult?.message,
        trace_id: traceId,
      });
    }
    trace('hub_verify_ok', { status: hubResponse.status });

    // IMPORTANT: use Hub's revalidated payload, not the untrusted request object.
    const payload = hubResult.payload;
    const organizationId = payload.organization_id as string;
    const hubUserId = payload.user_id as string;
    const email = String(payload.email || '').trim().toLowerCase();
    const rolesToSync = mapRoles(payload.roles);
    let revision: string | null;
    try { revision = sourceRevision(payload.source_revision); } catch {
      return json(403, { success: false, error_code: 'INVALID_SOURCE_REVISION', trace_id: traceId });
    }
    trace('claims', { hub_user_id: hubUserId, organization_id: organizationId, roles: rolesToSync, has_email: !!email });
    if (!organizationId || !hubUserId || !email || rolesToSync.length === 0) {
      failure('claims', { message: 'missing organization_id/user_id/email or no mappable role' });
      return json(403, { success: false, error_code: 'ROLE_OR_CLAIM_DENIED', trace_id: traceId });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    trace('env', { has_url: !!supabaseUrl, has_service_key: !!serviceRoleKey, has_anon_key: !!anonKey });
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      failure('env', { message: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY' });
      return json(500, { success: false, error_code: 'ENV_MISCONFIGURED', trace_id: traceId });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: org, error: orgError } = await admin.from('organizations').select('id').eq('id', organizationId).maybeSingle();
    if (orgError) {
      failure('org_lookup', orgError);
      return json(500, { success: false, error_code: 'ORG_LOOKUP_FAILED', message: orgError.message, trace_id: traceId });
    }
    if (!org) {
      failure('org_lookup', { message: 'organization not found: ' + organizationId });
      return json(404, { success: false, error_code: 'ORG_NOT_FOUND', message: 'Organization must be propagated from Hub first.', trace_id: traceId });
    }
    trace('org_ok');


    const projection = await applyHubProjection(admin, {
      hubUserId, organizationId, email, fullName: payload.full_name || '', roles: rolesToSync, revision,
    });
    if (!projection.ok) {
      return json(409, { success: false, error_code: projection.error, trace_id: traceId });
    }
    const userId = projection.userId;
    const localEmail = projection.localEmail;
    trace('role_sync_ok', { roles: rolesToSync });

    const anon = createClient(supabaseUrl, anonKey);
    const { session: createdSession, error: sessionCreateError } = await createUserSession(admin, anon, localEmail, trace);
    if (sessionCreateError || !createdSession) {
      failure('verify_otp', sessionCreateError ?? { message: 'no session after retries' });
      return json(500, { success: false, error_code: 'SESSION_CREATE_FAILED', message: sessionCreateError?.message, trace_id: traceId });
    }

    console.log('[SSO] SSO_SYNC', JSON.stringify({ trace_id: traceId, hub_user_id: hubUserId, local_user_id: userId, organization_id: organizationId, target_view: targetView, roles: rolesToSync }));

    return json(200, {
      success: true,
      access_token: createdSession.access_token,
      refresh_token: createdSession.refresh_token,
      user: { id: userId, email: localEmail, organization_id: organizationId, full_name: payload.full_name || null, sso_user: true },
      preferences: payload.preferences || null,
      source_revision: projection.source_revision,
      roles: rolesToSync,
      trace_id: traceId,
    });
  } catch (error) {
    failure(step, error);
    return json(500, { success: false, error_code: 'INTERNAL_ERROR', failed_step: step, message: String(error), trace_id: traceId });
  }

});

