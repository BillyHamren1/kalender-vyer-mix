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
  
  return expectedHex === signature.toLowerCase();
}

interface SsoPayload {
  user_id: string;
  email: string;
  organization_id: string | null;
  full_name: string | null;
  timestamp: number;
  expires_at: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payload, signature } = await req.json() as { payload: SsoPayload; signature: string };

    console.log('[SSO] Received verification request for:', payload?.email);

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

    const payloadString = JSON.stringify(normalizedPayload);
    console.log('[SSO] Verifying signature for normalized payload');
    
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
          organization_id: payload.organization_id 
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
          organization_id: payload.organization_id 
        }
      });
    }

    // 3. Generera tillfälligt lösenord och logga in
    const tempPassword = crypto.randomUUID();
    
    console.log('[SSO] Setting temporary password for user:', userId);
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: tempPassword
    });

    if (updateError) {
      console.error('[SSO] Failed to set temp password:', updateError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'PASSWORD_UPDATE_FAILED', message: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Logga in med tillfälligt lösenord för att få session
    console.log('[SSO] Signing in with temporary password');
    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: tempPassword,
    });

    if (signInError || !sessionData?.session) {
      console.error('[SSO] Sign in failed:', signInError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'SIGN_IN_FAILED', message: signInError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SSO] Session created successfully for:', payload.email);

    // 5. Returnera access_token och refresh_token
    return new Response(
      JSON.stringify({ 
        success: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: {
          id: userId,
          email: normalizedEmail,
          organization_id: payload.organization_id,
        }
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
