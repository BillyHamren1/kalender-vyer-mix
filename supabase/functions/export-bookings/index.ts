
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Validate API key using x-api-key header
    const API_KEY = Deno.env.get('EXPORT_API_KEY')
    const apiKey = req.headers.get('x-api-key')
    
    if (!apiKey || apiKey !== API_KEY) {
      console.error('Invalid or missing API key in x-api-key header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Parse URL parameters for filtering
    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const clientName = url.searchParams.get('client')
    
    console.log(`Export request received with filters - startDate: ${startDate}, endDate: ${endDate}, client: ${clientName}`)
    
    // Create some sample bookings with the expected 2505-XX format
    const sampleBookings = [
      {
        id: "2505-001",
        client: "Volvo Group",
        rigdaydate: "2025-05-20",
        eventdate: "2025-05-21",
        rigdowndate: "2025-05-22",
        deliveryaddress: "Volvo Headquarters, Gothenburg 405 31, Sweden",
        internalnotes: "Large corporate event, requires special setup",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        products: [
          { name: "Stage System", quantity: 1, notes: "8x6m with steps" },
          { name: "PA System", quantity: 1, notes: "Full range with subs" },
          { name: "LED Screen", quantity: 2, notes: "3x2m each" }
        ],
        attachments: [
          { 
            url: "https://example.com/files/volvo-event-plan.pdf", 
            file_name: "volvo-event-plan.pdf", 
            file_type: "application/pdf", 
            uploaded_at: new Date().toISOString() 
          }
        ],
        staff_assignments: [
          {
            date: "2025-05-20",
            event_type: "rig",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              },
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              }
            ]
          },
          {
            date: "2025-05-21",
            event_type: "event",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              }
            ]
          },
          {
            date: "2025-05-22",
            event_type: "rigDown",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715125567",
                name: "Björn Lidström",
                uuid: "q9r8s7t6-5u4v-3w2x-1y0z-a1b2c3d4e5f6"
              }
            ]
          }
        ]
      },
      {
        id: "2505-002",
        client: "Ericsson AB",
        rigdaydate: "2025-06-01",
        eventdate: "2025-06-02",
        rigdowndate: "2025-06-03",
        deliveryaddress: "Ericsson HQ, Kista, Stockholm",
        internalnotes: "Product launch event",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        products: [
          { name: "Sound System", quantity: 1, notes: "Full setup" },
          { name: "Lighting Rig", quantity: 1, notes: "Moving heads + LED" },
          { name: "Video Package", quantity: 1, notes: "Cameras + Mixing" }
        ],
        attachments: [],
        staff_assignments: [
          {
            date: "2025-06-01",
            event_type: "rig",
            team_id: "team-2",
            staff: [
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              },
              {
                id: "staff-1746715125567",
                name: "Björn Lidström",
                uuid: "q9r8s7t6-5u4v-3w2x-1y0z-a1b2c3d4e5f6"
              }
            ]
          },
          {
            date: "2025-06-02",
            event_type: "event",
            team_id: "team-2",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              }
            ]
          },
          {
            date: "2025-06-03",
            event_type: "rigDown",
            team_id: "team-2",
            staff: [
              {
                id: "staff-1746715125567",
                name: "Björn Lidström",
                uuid: "q9r8s7t6-5u4v-3w2x-1y0z-a1b2c3d4e5f6"
              }
            ]
          }
        ]
      },
      {
        id: "2505-003",
        client: "IKEA Sverige",
        rigdaydate: "2025-06-15",
        eventdate: "2025-06-16",
        rigdowndate: "2025-06-17",
        deliveryaddress: "IKEA Kungens Kurva, Stockholm",
        internalnotes: "Store reopening ceremony",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        products: [
          { name: "Sound System", quantity: 1, notes: "Medium sized" },
          { name: "Lighting", quantity: 1, notes: "Basic package" }
        ],
        attachments: [],
        staff_assignments: [
          {
            date: "2025-06-15",
            event_type: "rig",
            team_id: "team-3",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              }
            ]
          },
          {
            date: "2025-06-16",
            event_type: "event",
            team_id: "team-3",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              },
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              }
            ]
          },
          {
            date: "2025-06-17",
            event_type: "rigDown",
            team_id: "team-3",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              }
            ]
          }
        ]
      },
      {
        id: "2505-004",
        client: "H&M Global",
        rigdaydate: "2025-07-20",
        eventdate: "2025-07-21",
        rigdowndate: "2025-07-22",
        deliveryaddress: "H&M Head Office, Stockholm",
        internalnotes: "Fashion show event",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        products: [
          { name: "Runway Setup", quantity: 1, notes: "15m runway" },
          { name: "Lighting System", quantity: 1, notes: "Fashion show specific" },
          { name: "Audio System", quantity: 1, notes: "With DJ setup" },
          { name: "Video Recording", quantity: 1, notes: "Full package" }
        ],
        attachments: [
          { 
            url: "https://example.com/files/hm-fashion-plan.pdf", 
            file_name: "hm-fashion-plan.pdf", 
            file_type: "application/pdf", 
            uploaded_at: new Date().toISOString() 
          }
        ],
        staff_assignments: [
          {
            date: "2025-07-20",
            event_type: "rig",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              },
              {
                id: "staff-1746715125567",
                name: "Björn Lidström",
                uuid: "q9r8s7t6-5u4v-3w2x-1y0z-a1b2c3d4e5f6"
              }
            ]
          },
          {
            date: "2025-07-21",
            event_type: "event",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715090882",
                name: "Billy Hamrén",
                uuid: "f8c7d1a3-e2b6-4f37-9c1a-5d8f4e3b2a1c"
              },
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              },
              {
                id: "staff-1746715125567",
                name: "Björn Lidström",
                uuid: "q9r8s7t6-5u4v-3w2x-1y0z-a1b2c3d4e5f6"
              }
            ]
          },
          {
            date: "2025-07-22",
            event_type: "rigDown",
            team_id: "team-1",
            staff: [
              {
                id: "staff-1746715104689",
                name: "Joel Habegger",
                uuid: "a7b6c5d4-3e2f-1g8h-9i0j-k1l2m3n4o5p6"
              }
            ]
          }
        ]
      }
    ];
    
    // Apply filters to sample bookings
    let filteredBookings = [...sampleBookings];
    
    if (startDate) {
      filteredBookings = filteredBookings.filter(b => b.eventdate >= startDate);
    }
    
    if (endDate) {
      filteredBookings = filteredBookings.filter(b => b.eventdate <= endDate);
    }
    
    if (clientName) {
      const lowerCaseClient = clientName.toLowerCase();
      filteredBookings = filteredBookings.filter(b => 
        b.client.toLowerCase().includes(lowerCaseClient)
      );
    }
    
    console.log(`Returning ${filteredBookings.length} sample bookings`)

    // Return the data in the expected format
    return new Response(
      JSON.stringify({
        count: filteredBookings.length,
        bookings: filteredBookings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
