import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('TRAFIKVERKET_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'TRAFIKVERKET_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Trafikverket API uses XML POST requests
    const xmlBody = `
      <REQUEST>
        <LOGIN authenticationkey="${apiKey}" />
        <QUERY objecttype="Camera" schemaversion="1" limit="500">
          <FILTER>
            <EQ name="Active" value="true" />
            <EQ name="HasFullSizePhoto" value="true" />
          </FILTER>
          <INCLUDE>Id</INCLUDE>
          <INCLUDE>Name</INCLUDE>
          <INCLUDE>Description</INCLUDE>
          <INCLUDE>Geometry.WGS84</INCLUDE>
          <INCLUDE>PhotoUrl</INCLUDE>
          <INCLUDE>PhotoTime</INCLUDE>
          <INCLUDE>ContentType</INCLUDE>
          <INCLUDE>Direction</INCLUDE>
          <INCLUDE>Type</INCLUDE>
        </QUERY>
      </REQUEST>
    `

    const response = await fetch('https://api.trafikinfo.trafikverket.se/v2/data.json', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xmlBody,
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Trafikverket API error:', response.status, text)
      return new Response(
        JSON.stringify({ error: `Trafikverket API error: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    const data = await response.json()
    const cameras = data?.RESPONSE?.RESULT?.[0]?.Camera || []

    // Parse WGS84 point geometry -> lat/lng
    const parsed = cameras.map((cam: any) => {
      let lat: number | null = null
      let lng: number | null = null
      const geo = cam.Geometry?.WGS84
      if (geo) {
        // Format: "POINT (lng lat)"
        const match = geo.match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/)
        if (match) {
          lng = parseFloat(match[1])
          lat = parseFloat(match[2])
        }
      }

      return {
        id: cam.Id,
        name: cam.Name || 'Okänd kamera',
        description: cam.Description || '',
        lat,
        lng,
        photoUrl: cam.PhotoUrl || null,
        photoTime: cam.PhotoTime || null,
        direction: cam.Direction || null,
        type: cam.Type || null,
      }
    }).filter((c: any) => c.lat && c.lng && c.photoUrl)

    return new Response(
      JSON.stringify({ cameras: parsed, count: parsed.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error fetching cameras:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
