import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // 1. Kontrollera om användaren finns
    console.log('[SSO] Checking if user exists:', payload.user_id);
    const { data: existingUser, error: getUserError } = await supabase.auth.admin.getUserById(payload.user_id);

    if (getUserError || !existingUser?.user) {
      // Användaren finns inte - skapa den
      console.log('[SSO] User does not exist, creating:', payload.email);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        id: payload.user_id,
        email: payload.email,
        email_confirm: true,
        user_metadata: { 
          full_name: normalizedPayload.full_name,
          organization_id: payload.organization_id 
        }
      });

      if (createError) {
        console.error('[SSO] Failed to create user:', createError);
        return new Response(
          JSON.stringify({ success: false, error_code: 'USER_CREATE_FAILED', message: createError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('[SSO] User created successfully:', newUser?.user?.id);
    } else {
      console.log('[SSO] User exists:', existingUser.user.id);
    }

    // 2. Generera tillfälligt lösenord och logga in
    const tempPassword = crypto.randomUUID();
    
    console.log('[SSO] Setting temporary password for user');
    const { error: updateError } = await supabase.auth.admin.updateUserById(payload.user_id, {
      password: tempPassword
    });

    if (updateError) {
      console.error('[SSO] Failed to set temp password:', updateError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'PASSWORD_UPDATE_FAILED', message: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Logga in med tillfälligt lösenord för att få session
    console.log('[SSO] Signing in with temporary password');
    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      email: payload.email,
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

    // 4. Returnera access_token och refresh_token
    return new Response(
      JSON.stringify({ 
        success: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: {
          id: payload.user_id,
          email: payload.email,
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
