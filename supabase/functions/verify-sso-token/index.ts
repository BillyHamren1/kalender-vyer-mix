// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function findLegacyUserByEmail(admin: any, email: string) {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data?.users?.find((user: any) => (user.email || '').toLowerCase() === normalized);
    if (match) return match;
    if ((data?.users?.length || 0) < 200) return null;
  }
  return null;
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
      message: e?.message ?? String(e ?? ''),
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


    // Canonical identity is the Hub UUID. Email is only a one-time legacy adoption fallback.
    let userId = hubUserId;
    let localEmail = email;
    const { data: exact } = await admin.auth.admin.getUserById(hubUserId);
    if (!exact?.user) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        id: hubUserId,
        email,
        email_confirm: true,
        user_metadata: { full_name: payload.full_name || '', organization_id: organizationId, sso_user: true, hub_user_id: hubUserId },
      });
      if (createError || !created?.user) {
        const legacy = await findLegacyUserByEmail(admin, email);
        if (!legacy) return json(500, { success: false, error_code: 'USER_CREATE_FAILED', message: createError?.message });
        userId = legacy.id;
        localEmail = legacy.email || email;
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...legacy.user_metadata, full_name: payload.full_name || '', organization_id: organizationId, sso_user: true, hub_user_id: hubUserId },
        });
      } else {
        userId = created.user.id;
        localEmail = created.user.email || email;
      }
    } else {
      localEmail = exact.user.email || email;
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...exact.user.user_metadata, full_name: payload.full_name || '', organization_id: organizationId, sso_user: true, hub_user_id: hubUserId },
      });
    }

    // Profile organization remains the downstream runtime context, but Hub itself no longer mutates its profile.
    const { error: profileError } = await admin.from('profiles').upsert({
      user_id: userId,
      email: localEmail,
      full_name: payload.full_name || null,
      organization_id: organizationId,
    }, { onConflict: 'user_id' });
    if (profileError) return json(500, { success: false, error_code: 'PROFILE_SYNC_FAILED', message: profileError.message });

    // Tenant-safe role sync: replace only rows for this organization, preserve every other tenant membership.
    const { error: deleteError } = await admin.from('user_roles').delete().eq('user_id', userId).eq('organization_id', organizationId);
    if (deleteError) return json(500, { success: false, error_code: 'ROLE_DELETE_FAILED' });
    const roleRows = rolesToSync.map((role) => ({ user_id: userId, role, organization_id: organizationId }));
    const { error: roleInsertError } = await admin.from('user_roles').insert(roleRows);
    if (roleInsertError) return json(500, { success: false, error_code: 'ROLE_INSERT_FAILED', message: roleInsertError.message });

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: localEmail });
    if (linkError || !linkData?.properties?.hashed_token) {
      return json(500, { success: false, error_code: 'LINK_GENERATION_FAILED', message: linkError?.message });
    }

    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    if (verifyError || !sessionData?.session) {
      return json(500, { success: false, error_code: 'SESSION_CREATE_FAILED', message: verifyError?.message });
    }

    console.log('[SSO] SSO_SYNC', { hub_user_id: hubUserId, local_user_id: userId, organization_id: organizationId, target_view: targetView, roles: rolesToSync });

    return json(200, {
      success: true,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      user: { id: userId, email: localEmail, organization_id: organizationId, full_name: payload.full_name || null, sso_user: true },
      preferences: payload.preferences || null,
      roles: rolesToSync,
    });
  } catch (error) {
    console.error('[SSO] Verify SSO error:', error);
    return json(500, { success: false, error_code: 'INTERNAL_ERROR', message: String(error) });
  }
});
