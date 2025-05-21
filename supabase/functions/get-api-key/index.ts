
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Simple authorization check - this could be enhanced for better security
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get the key type from request body
    const { key_type } = await req.json()
    
    let apiKey: string | null = null
    
    // Return the appropriate API key based on the requested type
    switch (key_type) {
      case 'staff':
        apiKey = Deno.env.get('STAFF_API_KEY')
        break
      case 'export':
        apiKey = Deno.env.get('EXPORT_API_KEY')
        break
      case 'import':
        apiKey = Deno.env.get('IMPORT_API_KEY')
        break
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid key type requested' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
    
    if (!apiKey) {
      console.error(`API key not found for type: ${key_type}`)
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
    
    // Return the API key
    return new Response(
      JSON.stringify({ 
        apiKey,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() // Key valid for 1 hour
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing API key request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
