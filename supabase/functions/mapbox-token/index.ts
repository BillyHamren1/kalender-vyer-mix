
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🔑 Mapbox token request received');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the Mapbox token from environment variables
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
    
    console.log('📝 Token check:', mapboxToken ? 'Token found' : 'Token missing');
    
    if (!mapboxToken) {
      console.error('❌ MAPBOX_PUBLIC_TOKEN not found in environment');
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured in server environment' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }
    
    console.log('✅ Returning Mapbox token successfully');
    
    // Return the token
    return new Response(
      JSON.stringify({ 
        token: mapboxToken,
        expires: new Date(Date.now() + 3600 * 1000).toISOString() // 1 hour expiry
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    console.error('❌ Error in mapbox-token function:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
});
