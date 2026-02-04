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

    // Skapa session för användaren med admin-API
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Generera en magic link (för att få en giltig session)
    console.log('[SSO] Generating magic link for:', payload.email);
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: payload.email,
    });

    if (linkError || !linkData) {
      console.error('[SSO] Generate link error:', linkError);
      return new Response(
        JSON.stringify({ success: false, error_code: 'SESSION_CREATE_FAILED', message: linkError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extrahera tokens från länken
    const url = new URL(linkData.properties.action_link);
    const accessToken = url.searchParams.get('token') || linkData.properties.hashed_token;

    console.log('[SSO] Successfully verified and generated session for:', payload.email);

    return new Response(
      JSON.stringify({ 
        success: true,
        access_token: accessToken,
        hashed_token: linkData.properties.hashed_token,
        verification_type: 'magiclink',
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
