
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching staff data from external API');
    
    // Get selected date from request, or use current date
    const { date } = await req.json().catch(() => ({ date: new Date().toISOString().split('T')[0] }));
    console.log('Fetching staff for date:', date);
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get API key from environment
    const apiKey = Deno.env.get('STAFF_API_KEY');
    if (!apiKey) {
      throw new Error('API key not configured');
    }
    
    // Call external API
    const response = await fetch('https://enrhmahpgtfnxmhrgxdv.supabase.co/functions/v1/get-staff', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const staffData = await response.json();
    console.log('Received staff data:', staffData);
    
    // Store staff data in database
    if (staffData && staffData.data && Array.isArray(staffData.data)) {
      for (const staff of staffData.data) {
        if (!staff.id || !staff.name) continue;
        
        // Check if staff exists in database
        const { data: existingStaff } = await supabase
          .from('staff_members')
          .select('id')
          .eq('id', staff.id)
          .single();
          
        if (!existingStaff) {
          // Insert new staff
          await supabase
            .from('staff_members')
            .insert({
              id: staff.id,
              name: staff.name,
              email: staff.email || null,
              phone: staff.phone || null
            });
        } else {
          // Update existing staff
          await supabase
            .from('staff_members')
            .update({
              name: staff.name,
              email: staff.email || null,
              phone: staff.phone || null
            })
            .eq('id', staff.id);
        }
      }
    }
    
    // Make sure we return a properly formatted response with an array
    const responseData = {
      success: true,
      data: Array.isArray(staffData.data) ? staffData.data : []
    };
    
    // Return the staff data
    return new Response(JSON.stringify(responseData), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error('Error in fetch_staff_for_planning function:', error);
    // Return an empty array on error to prevent client-side errors
    return new Response(JSON.stringify({ 
      error: error.message, 
      success: false, 
      data: [] 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
