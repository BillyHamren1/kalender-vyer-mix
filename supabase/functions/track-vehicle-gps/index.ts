import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GpsUpdate {
  vehicle_id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
}

// Haversine distance in meters
function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { vehicle_id, lat, lng, heading, speed_kmh }: GpsUpdate = await req.json();

    if (!vehicle_id || lat === undefined || lng === undefined) {
      return new Response(
        JSON.stringify({ error: 'vehicle_id, lat, and lng are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`GPS update for vehicle ${vehicle_id}: ${lat}, ${lng}`);

    // Update vehicle's current position
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({
        current_lat: lat,
        current_lng: lng,
        current_heading: heading || null,
        last_gps_update: new Date().toISOString()
      })
      .eq('id', vehicle_id);

    if (updateError) {
      throw new Error(`Failed to update vehicle position: ${updateError.message}`);
    }

    // Save to GPS history
    const { error: historyError } = await supabase
      .from('vehicle_gps_history')
      .insert({
        vehicle_id,
        lat,
        lng,
        heading: heading || null,
        speed_kmh: speed_kmh || null
      });

    if (historyError) {
      console.error('Failed to save GPS history:', historyError);
      // Don't fail the request for history errors
    }

    // Check geofencing - find next pending stop for this vehicle
    const today = new Date().toISOString().split('T')[0];
    const { data: assignments, error: assignmentsError } = await supabase
      .from('transport_assignments')
      .select('id, booking_id, status')
      .eq('vehicle_id', vehicle_id)
      .eq('transport_date', today)
      .in('status', ['pending', 'in_transit'])
      .order('stop_order', { ascending: true })
      .limit(1);

    let geofenceTriggered = false;
    let triggeredBookingId: string | null = null;

    if (!assignmentsError && assignments && assignments.length > 0) {
      const nextStop = assignments[0];
      
      // Get booking coordinates
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, delivery_latitude, delivery_longitude')
        .eq('id', nextStop.booking_id)
        .single();

      if (!bookingError && booking && booking.delivery_latitude && booking.delivery_longitude) {
        const distanceToStop = haversineDistanceMeters(
          lat, lng,
          booking.delivery_latitude,
          booking.delivery_longitude
        );

        // Geofence radius: 100 meters
        if (distanceToStop <= 100) {
          console.log(`Geofence triggered! Vehicle ${vehicle_id} arrived at stop ${nextStop.booking_id}`);
          
          // Update assignment status to in_transit (driver needs to confirm delivered)
          const { error: geofenceUpdateError } = await supabase
            .from('transport_assignments')
            .update({ 
              status: 'in_transit',
              estimated_arrival: new Date().toISOString()
            })
            .eq('id', nextStop.id);

          if (!geofenceUpdateError) {
            geofenceTriggered = true;
            triggeredBookingId = nextStop.booking_id;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        vehicle_id,
        position: { lat, lng },
        geofence_triggered: geofenceTriggered,
        arrived_at_booking: triggeredBookingId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in track-vehicle-gps:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
