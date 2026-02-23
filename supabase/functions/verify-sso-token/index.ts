import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUB_VERIFY_URL = 'https://dmhuzjefqiqwafdtcipt.supabase.co/functions/v1/verify-sso-token';

interface SsoPreferences {
  language?: string;
  timezone?: string;
  dateFormat?: string;
}

interface SsoPayload {
  user_id: string;
  email: string;
  organization_id: string | null;
  full_name: string | null;
  timestamp: number;
  expires_at: number;
  preferences?: SsoPreferences;
  roles?: string[];
}

interface HubVerifyResponse {
  valid: boolean;
  payload?: SsoPayload;
  error?: string;
}

type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

// Delegera signaturverifiering till Hubbens centrala endpoint
async function verifyWithHub(payload: SsoPayload, signature: string): Promise<HubVerifyResponse> {
  console.log('[SSO] Delegating signature verification to Hub...');
  
  const response = await fetch(HUB_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, signature }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SSO] Hub verification request failed:', response.status, errorText);
    try {
      const errorJson = JSON.parse(errorText);
      return { valid: false, error: errorJson.error_code || errorJson.error || 'HUB_ERROR' };
    } catch {
      return { valid: false, error: 'HUB_UNREACHABLE' };
    }
  }

  const result = await response.json();
  console.log('[SSO] Hub verification result:', { valid: result.valid, error: result.error });
  
  // Hub returnerar { valid: true, payload: {...} } eller { valid: false, error: "..." }
  if (result.valid !== undefined) {
    return result as HubVerifyResponse;
  }
  // Fallback: om Hub returnerar success-format
  if (result.success !== undefined) {
    return {
      valid: result.success === true,
      payload: result.success ? payload : undefined,
      error: result.error_code || result.error,
    };
  }
  
  return { valid: false, error: 'UNEXPECTED_HUB_RESPONSE' };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payload, signature, target_view } = await req.json() as { 
      payload: SsoPayload; 
      signature: string;
      target_view?: 'planning' | 'warehouse';
    };

    console.log('[SSO] Received verification request for:', payload?.email, 'target_view:', target_view);

    if (!payload || !signature) {
      console.error('[SSO] Missing payload or signature');
      return new Response(
        JSON.stringify({ success: false, error_code: 'MISSING_DATA' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delegera signaturverifiering till Hubben (ingen lokal HMAC)
    const hubResult = await verifyWithHub(payload, signature);

    if (!hubResult.valid) {
      console.error('[SSO] Hub rejected token:', hubResult.error);
      return new Response(
        JSON.stringify({ success: false, error_code: hubResult.error || 'SIGNATURE_MISMATCH' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SSO] Hub verified token successfully for:', payload.email);

    // Kontrollera att token inte är utgången (extra säkerhet lokalt)
    const now = Math.floor(Date.now() / 1000);
    if (payload.expires_at < now) {
      console.error('[SSO] Token expired at:', payload.expires_at, 'current time:', now);
      return new Response(
        JSON.stringify({ success: false, error_code: 'TOKEN_EXPIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Befintlig sessionsskapande logik (oförändrad) ===

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Resolve organization_id for multi-tenant (STRICT: require explicit org_id)
    let resolvedOrgId = payload.organization_id;
    if (!resolvedOrgId) {
      console.warn('[SSO] DEPRECATION WARNING: organization_id not in payload, falling back to first org. Hub must send organization_id explicitly.');
      const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
      resolvedOrgId = orgData?.id;
    } else {
      // Validate org exists
      const { data: orgCheck } = await supabase.from('organizations').select('id').eq('id', resolvedOrgId).single();
      if (!orgCheck) {
        return new Response(
          JSON.stringify({ success: false, error_code: 'ORG_NOT_FOUND', message: 'Organization not found. Create it first via manage-organization.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Normalisera email för säker sökning
    const normalizedEmail = payload.email.trim().toLowerCase();
    const normalizedFullName = payload.full_name || null;
    console.log('[SSO] Normalized email:', normalizedEmail);

    // 1. IDEMPOTENT: Sök först via email för att hantera existerande användare
    let userId = payload.user_id;
    let userExists = false;

    // Försök hitta användare via email i profiles-tabellen först
    const { data: profileData } = await supabase
      .from('profiles')
      .select('user_id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (profileData?.user_id) {
      console.log('[SSO] Found existing user via profiles:', profileData.user_id);
      userId = profileData.user_id;
      userExists = true;
    } else {
      // Fallback: Sök via admin listUsers API
      console.log('[SSO] Searching for user via admin API...');
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (!listError && listData?.users) {
        const existingUser = listData.users.find(
          u => u.email?.toLowerCase() === normalizedEmail
        );
        if (existingUser) {
          console.log('[SSO] Found existing user via admin search:', existingUser.id);
          userId = existingUser.id;
          userExists = true;
        }
      }
    }

    // 2. Om användaren inte finns - skapa den
    if (!userExists) {
      console.log('[SSO] User does not exist, creating:', normalizedEmail);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        id: payload.user_id,
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: { 
          full_name: normalizedFullName,
          organization_id: payload.organization_id,
          sso_user: true,
        }
      });

      if (createError) {
        if (createError.message?.includes('already been registered')) {
          console.log('[SSO] User already registered (race condition), searching again...');
          const { data: retryList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = retryList?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
          if (found) {
            userId = found.id;
            userExists = true;
            console.log('[SSO] Found user on retry:', userId);
          } else {
            console.error('[SSO] Failed to find user even after retry');
            return new Response(
              JSON.stringify({ success: false, error_code: 'USER_CREATE_FAILED', message: createError.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          console.error('[SSO] Failed to create user:', createError);
          return new Response(
            JSON.stringify({ success: false, error_code: 'USER_CREATE_FAILED', message: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('[SSO] User created successfully:', newUser?.user?.id);
        userId = newUser?.user?.id || payload.user_id;
      }
    } else {
      // Uppdatera metadata för befintlig användare
      console.log('[SSO] Updating existing user metadata:', userId);
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { 
          full_name: normalizedFullName,
          organization_id: payload.organization_id,
          sso_user: true,
        }
      });
    }

    // 3. Sync roles: prefer Hub-provided roles, fallback to target_view
    const VALID_ROLES: AppRole[] = ['admin', 'forsaljning', 'projekt', 'lager'];
    let rolesToSync: AppRole[] = [];

    if (payload.roles && Array.isArray(payload.roles) && payload.roles.length > 0) {
      // Hub sent explicit roles — use them (authoritative source)
      rolesToSync = payload.roles.filter(r => VALID_ROLES.includes(r as AppRole)) as AppRole[];
      console.log('[SSO] Using Hub-provided roles:', rolesToSync);
    } else {
      // Fallback: guess from target_view (backward compat)
      if (target_view === 'warehouse') rolesToSync = ['lager'];
      else if (target_view === 'planning') rolesToSync = ['projekt'];
      else rolesToSync = ['projekt', 'lager'];
      console.log('[SSO] No Hub roles, fallback to target_view:', target_view, '→', rolesToSync);
    }

    // Full sync: delete existing + insert new (same pattern as receive-user-sync)
    console.log('[SSO] Syncing roles for user:', userId, '→', rolesToSync);
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    
    if (deleteError) {
      console.warn('[SSO] Failed to delete old roles:', deleteError.message);
    }

    for (const role of rolesToSync) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role, organization_id: resolvedOrgId })
        .select()
        .single();
      
      if (roleError && !roleError.message?.includes('duplicate')) {
        console.warn('[SSO] Failed to assign role:', role, roleError.message);
      }
    }

    // 4. Generera magiclink för att skapa session utan att ändra lösenord
    console.log('[SSO] Generating magiclink for user:', normalizedEmail);
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[SSO] Failed to generate magiclink:', linkError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'LINK_GENERATION_FAILED', message: linkError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Verifiera OTP-token för att få session
    console.log('[SSO] Verifying OTP to create session');
    const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (verifyError || !sessionData?.session) {
      console.error('[SSO] OTP verification failed:', verifyError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'SESSION_CREATE_FAILED', message: verifyError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SSO] Session created successfully for:', payload.email);

    // 6. Returnera access_token, refresh_token, och preferences
    return new Response(
      JSON.stringify({ 
        success: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: {
          id: userId,
          email: normalizedEmail,
          organization_id: payload.organization_id,
          full_name: normalizedFullName,
          sso_user: true,
        },
        preferences: payload.preferences || null,
        roles: rolesToSync,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SSO] Verify SSO error:', error);
    return new Response(
      JSON.stringify({ success: false, error_code: 'INTERNAL_ERROR', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
