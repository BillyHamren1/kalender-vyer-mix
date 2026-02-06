import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Måste matcha Hubbens normalisering - strippar icke-ASCII-tecken
function stripNonAscii(value: string): string {
  return value.replace(/[^\x00-\x7F]/g, '');
}

// HMAC-SHA256 verifiering - EXAKT samma som Hubbens signering
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // Konvertera till hex-sträng (lowercase)
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // DIAGNOSTIK: Logga för att identifiera mismatch-orsak
  console.log('[SSO-DEBUG] Payload length:', payload.length);
  console.log('[SSO-DEBUG] Payload string:', payload);
  console.log('[SSO-DEBUG] Expected sig (first 16):', expectedHex.substring(0, 16));
  console.log('[SSO-DEBUG] Received sig (first 16):', signature.toLowerCase().substring(0, 16));
  console.log('[SSO-DEBUG] Signatures match:', expectedHex === signature.toLowerCase());
  
  return expectedHex === signature.toLowerCase();
}

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
}

type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

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

    const ssoSecret = Deno.env.get('SSO_SECRET');
    if (!ssoSecret) {
      console.error('[SSO] SSO_SECRET not configured');
      return new Response(
        JSON.stringify({ success: false, error_code: 'SSO_NOT_CONFIGURED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalisera full_name innan verifiering (måste matcha Hubbens signering)
    const normalizedPayload = {
      ...payload,
      full_name: payload.full_name ? stripNonAscii(payload.full_name) : null,
    };

    // Remove preferences from signature verification (may not be signed)
    const payloadForSignature = {
      user_id: normalizedPayload.user_id,
      email: normalizedPayload.email,
      organization_id: normalizedPayload.organization_id,
      full_name: normalizedPayload.full_name,
      timestamp: normalizedPayload.timestamp,
      expires_at: normalizedPayload.expires_at,
    };

    const payloadString = JSON.stringify(payloadForSignature);
    console.log('[SSO-DEBUG] payloadForSignature keys:', Object.keys(payloadForSignature));
    console.log('[SSO-DEBUG] payloadString:', payloadString);
    console.log('[SSO-DEBUG] received signature:', signature);
    console.log('[SSO-DEBUG] SSO_SECRET length:', ssoSecret.length);
    console.log('[SSO-DEBUG] SSO_SECRET first 4 chars:', ssoSecret.substring(0, 4));
    
    const isValid = await verifySignature(payloadString, signature, ssoSecret);

    if (!isValid) {
      console.error('[SSO] Signature mismatch');
      return new Response(
        JSON.stringify({ success: false, error_code: 'SIGNATURE_MISMATCH' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Kontrollera att token inte är utgången
    const now = Math.floor(Date.now() / 1000);
    if (payload.expires_at < now) {
      console.error('[SSO] Token expired at:', payload.expires_at, 'current time:', now);
      return new Response(
        JSON.stringify({ success: false, error_code: 'TOKEN_EXPIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skapa session direkt med admin-API
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Normalisera email för säker sökning
    const normalizedEmail = payload.email.trim().toLowerCase();
    console.log('[SSO] Normalized email:', normalizedEmail);

    // 1. IDEMPOTENT: Sök först via email (inte user_id) för att hantera existerande användare
    let userId = payload.user_id;
    let userExists = false;

    // Försök hitta användare via email i profiles-tabellen först (snabbast)
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
      // Fallback: Sök via admin listUsers API (paginerad sökning)
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
          full_name: normalizedPayload.full_name,
          organization_id: payload.organization_id,
          sso_user: true, // Mark as SSO user
        }
      });

      if (createError) {
        // Dubbelkolla om "already registered" - i så fall hitta användaren
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
          full_name: normalizedPayload.full_name,
          organization_id: payload.organization_id,
          sso_user: true, // Mark as SSO user
        }
      });
    }

    // 3. Auto-assign roles for SSO users based on target_view
    console.log('[SSO] Ensuring roles for user:', userId, 'target_view:', target_view);
    
    // Determine which roles to assign
    const rolesToAssign: AppRole[] = [];
    
    if (target_view === 'warehouse') {
      rolesToAssign.push('lager');
    } else if (target_view === 'planning') {
      rolesToAssign.push('projekt');
    } else {
      // Default: assign both roles for full access
      rolesToAssign.push('projekt', 'lager');
    }
    
    // Check existing roles
    const { data: existingRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    const existingRoleSet = new Set(existingRoles?.map(r => r.role) || []);
    
    // Insert missing roles (idempotent - ignore conflicts)
    for (const role of rolesToAssign) {
      if (!existingRoleSet.has(role)) {
        console.log('[SSO] Assigning role:', role, 'to user:', userId);
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role })
          .select()
          .single();
        
        if (roleError && !roleError.message?.includes('duplicate')) {
          console.warn('[SSO] Failed to assign role:', role, roleError.message);
        }
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

    // 5. Verifiera OTP-token för att få session (utan att röra lösenord)
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
          full_name: normalizedPayload.full_name,
          sso_user: true,
        },
        preferences: payload.preferences || null,
        roles: [...existingRoleSet, ...rolesToAssign.filter(r => !existingRoleSet.has(r))],
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
