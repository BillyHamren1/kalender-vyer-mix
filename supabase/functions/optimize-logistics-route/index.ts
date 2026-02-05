import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RouteStop {
  booking_id: string;
  lat: number;
  lng: number;
  client: string;
  address: string;
}

interface OptimizeRequest {
  vehicle_id: string;
  transport_date: string;
  start_lat?: number;
  start_lng?: number;
}

// Haversine distance calculation (fallback when no API key)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Simple nearest neighbor optimization (fallback)
function optimizeWithNearestNeighbor(stops: RouteStop[], startLat: number, startLng: number): RouteStop[] {
  if (stops.length <= 1) return stops;
  
  const result: RouteStop[] = [];
  const remaining = [...stops];
  let currentLat = startLat;
  let currentLng = startLng;
  
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }
    
    const nearest = remaining.splice(nearestIndex, 1)[0];
    result.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }
  
  return result;
}

// Calculate total distance of a route
function calculateTotalDistance(stops: RouteStop[], startLat: number, startLng: number): number {
  if (stops.length === 0) return 0;
  
  let total = haversineDistance(startLat, startLng, stops[0].lat, stops[0].lng);
  
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineDistance(stops[i].lat, stops[i].lng, stops[i+1].lat, stops[i+1].lng);
  }
  
  return total;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { vehicle_id, transport_date, start_lat, start_lng }: OptimizeRequest = await req.json();

    if (!vehicle_id || !transport_date) {
      return new Response(
        JSON.stringify({ error: 'vehicle_id and transport_date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Optimizing route for vehicle ${vehicle_id} on ${transport_date}`);

    // Fetch transport assignments with booking details
    const { data: assignments, error: assignmentsError } = await supabase
      .from('transport_assignments')
      .select('id, booking_id, stop_order')
      .eq('vehicle_id', vehicle_id)
      .eq('transport_date', transport_date);

    if (assignmentsError) {
      throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`);
    }

    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No stops to optimize',
          optimized_order: [],
          total_distance_km: 0,
          total_duration_min: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch booking coordinates
    const bookingIds = assignments.map(a => a.booking_id);
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, client, deliveryaddress, delivery_city, delivery_latitude, delivery_longitude')
      .in('id', bookingIds);

    if (bookingsError) {
      throw new Error(`Failed to fetch bookings: ${bookingsError.message}`);
    }

    // Build stops array with coordinates
    const stops: RouteStop[] = [];
    for (const booking of bookings || []) {
      if (booking.delivery_latitude && booking.delivery_longitude) {
        stops.push({
          booking_id: booking.id,
          lat: booking.delivery_latitude,
          lng: booking.delivery_longitude,
          client: booking.client || 'Unknown',
          address: `${booking.deliveryaddress || ''}, ${booking.delivery_city || ''}`.trim()
        });
      }
    }

    if (stops.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No stops with valid coordinates',
          optimized_order: bookingIds,
          total_distance_km: 0,
          total_duration_min: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default start location (Stockholm) or use provided
    const startLat = start_lat || 59.3293;
    const startLng = start_lng || 18.0686;

    let optimizedStops: RouteStop[];
    let totalDistanceKm: number;
    let totalDurationMin: number;
    let usedGoogleApi = false;

    // Try Google Routes API if key is available
    if (googleMapsApiKey && stops.length >= 2) {
      try {
        console.log('Attempting Google Routes API optimization...');
        
        const origin = { location: { latLng: { latitude: startLat, longitude: startLng } } };
        const destination = { location: { latLng: { latitude: stops[stops.length - 1].lat, longitude: stops[stops.length - 1].lng } } };
        const intermediates = stops.slice(0, -1).map(s => ({
          location: { latLng: { latitude: s.lat, longitude: s.lng } }
        }));

        const routeRequest = {
          origin,
          destination,
          intermediates,
          travelMode: 'DRIVE',
          optimizeWaypointOrder: true,
          routingPreference: 'TRAFFIC_AWARE'
        };

        const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleMapsApiKey,
            'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration'
          },
          body: JSON.stringify(routeRequest)
        });

        if (googleResponse.ok) {
          const routeData = await googleResponse.json();
          
          if (routeData.routes && routeData.routes[0]) {
            const route = routeData.routes[0];
            const optimizedOrder = route.optimizedIntermediateWaypointIndex || [];
            
            // Reorder stops based on Google's optimization
            optimizedStops = optimizedOrder.map((idx: number) => stops[idx]);
            // Add the destination (last stop) at the end
            optimizedStops.push(stops[stops.length - 1]);
            
            totalDistanceKm = (route.distanceMeters || 0) / 1000;
            // Duration is in seconds with 's' suffix, e.g. "3600s"
            const durationStr = route.duration || '0s';
            totalDurationMin = parseInt(durationStr.replace('s', '')) / 60;
            usedGoogleApi = true;
            
            console.log('Google Routes API optimization successful');
          }
        } else {
          console.log('Google Routes API failed, falling back to nearest neighbor');
        }
      } catch (googleError) {
        console.error('Google Routes API error:', googleError);
      }
    }

    // Fallback to nearest neighbor if Google API not used
    if (!usedGoogleApi) {
      console.log('Using nearest neighbor optimization');
      optimizedStops = optimizeWithNearestNeighbor(stops, startLat, startLng);
      totalDistanceKm = calculateTotalDistance(optimizedStops, startLat, startLng);
      // Rough estimate: 40 km/h average speed + 10 min per stop
      totalDurationMin = (totalDistanceKm / 40) * 60 + (optimizedStops.length * 10);
    }

    // Update stop_order in database
    for (let i = 0; i < optimizedStops!.length; i++) {
      const { error: updateError } = await supabase
        .from('transport_assignments')
        .update({ stop_order: i + 1 })
        .eq('vehicle_id', vehicle_id)
        .eq('transport_date', transport_date)
        .eq('booking_id', optimizedStops![i].booking_id);

      if (updateError) {
        console.error(`Failed to update stop order for ${optimizedStops![i].booking_id}:`, updateError);
      }
    }

    console.log(`Route optimized: ${optimizedStops!.length} stops, ${totalDistanceKm!.toFixed(1)} km, ${totalDurationMin!.toFixed(0)} min`);

    return new Response(
      JSON.stringify({
        success: true,
        optimized_order: optimizedStops!.map(s => s.booking_id),
        stops: optimizedStops!.map((s, i) => ({
          order: i + 1,
          booking_id: s.booking_id,
          client: s.client,
          address: s.address,
          lat: s.lat,
          lng: s.lng
        })),
        total_distance_km: Math.round(totalDistanceKm! * 10) / 10,
        total_duration_min: Math.round(totalDurationMin!),
        used_google_api: usedGoogleApi
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in optimize-logistics-route:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
