
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TrackedTimeRequest {
  start_date?: string;
  end_date?: string;
  user_ids?: string[] | null;
  booking_numbers?: string[] | null;
  format?: 'json' | 'csv' | 'geojson';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Fetch tracked time request received')

    // Get the API key from environment
    const apiKey = Deno.env.get('TRACKED_TIME_API_KEY')
    if (!apiKey) {
      console.error('TRACKED_TIME_API_KEY not found in environment')
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Parse request body
    const requestData: TrackedTimeRequest = await req.json()
    console.log('Request parameters:', requestData)

    // Prepare the request to the external API
    const externalApiUrl = 'https://yvnxoszroabczgwlgfcx.supabase.co/functions/v1/export-tracked-time'
    
    const externalRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    }

    console.log('Making request to external API:', externalApiUrl)

    // Make the request to the external API
    const response = await fetch(externalApiUrl, externalRequest)
    
    console.log('External API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('External API error:', errorText)
      
      return new Response(
        JSON.stringify({ 
          error: 'External API request failed', 
          status: response.status,
          details: errorText 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: response.status 
        }
      )
    }

    // Get the response data
    const contentType = response.headers.get('content-type')
    
    if (requestData.format === 'csv') {
      const csvData = await response.text()
      return new Response(csvData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="tracked-time.csv"'
        }
      })
    } else if (requestData.format === 'geojson') {
      const geoJsonData = await response.json()
      return new Response(JSON.stringify(geoJsonData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/geo+json'
        }
      })
    } else {
      // Default JSON format
      const jsonData = await response.json()
      console.log('Returning JSON data with', jsonData.users?.length || 0, 'users')
      
      return new Response(JSON.stringify(jsonData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      })
    }

  } catch (error) {
    console.error('Error in fetch-tracked-time function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
