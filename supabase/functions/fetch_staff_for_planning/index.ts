
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Enhanced CORS headers for better iframe support
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, origin, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
}

// Sample staff data (in a real application, this would come from a database or API)
const sampleStaffData = [
  {
    id: "staff-1746715090882",
    name: "Billy Hamrén",
    role: "Builder",
    email: "billy.hamren@fransaugust.se",
    phone: "0733182170",
    specialties: [],
    isavailable: true,
    username: "billy.hamren",
    password: "password",
    notes: null
  },
  {
    id: "staff-1746715104689",
    name: "Joel Habegger",
    role: "Builder",
    email: "joel@fransaugust.se",
    phone: null,
    specialties: [],
    isavailable: true,
    username: "joel",
    password: "password",
    notes: null
  },
  {
    id: "staff-1746715125567",
    name: "Björn Lidström",
    role: "Builder",
    email: "bjorn@fransaugust.se",
    phone: null,
    specialties: [],
    isavailable: true,
    username: "bjorn",
    password: "password",
    notes: null
  }
];

serve(async (req) => {
  console.log(`${req.method} request received at ${new Date().toISOString()}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { 
      headers: corsHeaders,
      status: 204
    });
  }

  try {
    // Get the date from the request body if available
    let requestDate;
    if (req.method === 'POST') {
      const requestData = await req.json();
      requestDate = requestData.date;
      console.log(`Fetching staff for date: ${requestDate}`);
    }

    console.log('Fetching staff data from external API');
    
    // In a real application, this would call an external API
    // For demo purposes, we'll use the sample data
    
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Log the staff data we're returning
    console.log(`Received staff data: ${JSON.stringify({
      success: true,
      count: sampleStaffData.length,
      data: sampleStaffData
    }, null, 2)}`);
    
    // Return the staff data with CORS headers
    return new Response(
      JSON.stringify({
        success: true,
        count: sampleStaffData.length,
        data: sampleStaffData
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    );
  } catch (error) {
    console.error(`Error processing request: ${error.message}`);
    
    // Return error with CORS headers
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      }
    );
  }
})
