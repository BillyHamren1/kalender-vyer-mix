import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Stop {
  bookingId: string;
  client: string;
  address: string | null;
  lat: number;
  lng: number;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
}

interface OptimizedResult {
  optimized_order: number[];
  stops: Stop[];
  total_distance_km: number;
  total_duration_min: number;
  polyline: any; // GeoJSON
  ai_suggestions: string;
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest-neighbor fallback
function nearestNeighborOrder(stops: Stop[]): number[] {
  if (stops.length <= 1) return stops.map((_, i) => i);
  const visited = new Set<number>();
  const order: number[] = [0];
  visited.add(0);
  while (order.length < stops.length) {
    const last = stops[order[order.length - 1]];
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
      if (visited.has(i)) continue;
      const d = haversine(last.lat, last.lng, stops[i].lat, stops[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    order.push(bestIdx);
    visited.add(bestIdx);
  }
  return order;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);
  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  try {
    const { staff_id, date, start_lat, start_lng } = await req.json();
    if (!staff_id || !date) {
      return new Response(JSON.stringify({ error: 'staff_id and date are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch assignments for this staff member on this date
    const { data: assignments, error: assignErr } = await supabase
      .from('booking_staff_assignments')
      .select('booking_id')
      .eq('staff_id', staff_id)
      .eq('assignment_date', date);

    if (assignErr) throw assignErr;
    if (!assignments?.length) {
      return new Response(JSON.stringify({ error: 'No assignments found', stops: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bookingIds = [...new Set(assignments.map(a => a.booking_id))];

    // 2. Fetch booking coordinates + calendar events
    const [bookingsRes, eventsRes] = await Promise.all([
      supabase.from('bookings')
        .select('id, client, deliveryaddress, delivery_latitude, delivery_longitude')
        .in('id', bookingIds),
      supabase.from('calendar_events')
        .select('booking_id, start_time, end_time, event_type')
        .in('booking_id', bookingIds)
        .gte('start_time', `${date}T00:00:00`)
        .lte('start_time', `${date}T23:59:59`),
    ]);

    const bookingMap = new Map((bookingsRes.data || []).map(b => [b.id, b]));
    const eventMap = new Map((eventsRes.data || []).map(e => [e.booking_id!, e]));

    // 3. Build stops array (only those with coordinates)
    const stops: Stop[] = [];
    for (const bId of bookingIds) {
      const b = bookingMap.get(bId);
      if (!b || !b.delivery_latitude || !b.delivery_longitude) continue;
      const ev = eventMap.get(bId);
      stops.push({
        bookingId: bId,
        client: b.client,
        address: b.deliveryaddress,
        lat: b.delivery_latitude,
        lng: b.delivery_longitude,
        startTime: ev?.start_time || null,
        endTime: ev?.end_time || null,
        eventType: ev?.event_type || null,
      });
    }

    if (stops.length < 2) {
      return new Response(JSON.stringify({
        optimized_order: stops.map((_, i) => i),
        stops,
        total_distance_km: 0,
        total_duration_min: 0,
        polyline: null,
        ai_suggestions: stops.length === 0 ? 'Inga stopp med koordinater hittades.' : 'Bara ett stopp — ingen optimering behövs.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Call Mapbox Optimization API
    let optimizedOrder: number[] = nearestNeighborOrder(stops);
    let polyline: any = null;
    let totalDistanceKm = 0;
    let totalDurationMin = 0;

    if (mapboxToken) {
      try {
        // Build coordinate string: lng,lat;lng,lat;...
        const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
        const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?access_token=${mapboxToken}&geometries=geojson&overview=full&roundtrip=false&source=first&destination=last`;

        const mapboxRes = await fetch(url);
        if (mapboxRes.ok) {
          const data = await mapboxRes.json();
          if (data.code === 'Ok' && data.trips?.[0]) {
            const trip = data.trips[0];
            // Extract waypoint order
            if (data.waypoints) {
              optimizedOrder = data.waypoints
                .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
                .map((wp: any) => wp.original_index ?? wp.waypoint_index);
            }
            polyline = trip.geometry; // GeoJSON LineString
            totalDistanceKm = Math.round((trip.distance / 1000) * 10) / 10;
            totalDurationMin = Math.round(trip.duration / 60);
          }
        } else {
          console.error('Mapbox Optimization API error:', mapboxRes.status, await mapboxRes.text());
        }
      } catch (e) {
        console.error('Mapbox fallback to nearest-neighbor:', e);
      }
    }

    // If no polyline from optimization, try Directions API for the ordered route
    if (!polyline && mapboxToken && stops.length >= 2) {
      try {
        const orderedStops = optimizedOrder.map(i => stops[i]);
        const coords = orderedStops.map(s => `${s.lng},${s.lat}`).join(';');
        const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${mapboxToken}&geometries=geojson&overview=full`;
        const dirRes = await fetch(dirUrl);
        if (dirRes.ok) {
          const dirData = await dirRes.json();
          if (dirData.routes?.[0]) {
            polyline = dirData.routes[0].geometry;
            totalDistanceKm = Math.round((dirData.routes[0].distance / 1000) * 10) / 10;
            totalDurationMin = Math.round(dirData.routes[0].duration / 60);
          }
        }
      } catch (e) {
        console.error('Directions fallback error:', e);
      }
    }

    // Calculate fallback distance if still no API result
    if (totalDistanceKm === 0) {
      for (let i = 0; i < optimizedOrder.length - 1; i++) {
        const a = stops[optimizedOrder[i]];
        const b = stops[optimizedOrder[i + 1]];
        totalDistanceKm += haversine(a.lat, a.lng, b.lat, b.lng);
      }
      totalDistanceKm = Math.round(totalDistanceKm * 10) / 10;
      totalDurationMin = Math.round(totalDistanceKm * 1.2); // rough estimate
    }

    // 5. Reorder stops
    const orderedStops = optimizedOrder.map(i => stops[i]);

    // 6. AI analysis via Lovable AI Gateway (Gemini)
    let aiSuggestions = '';
    if (lovableApiKey) {
      try {
        const stopsDescription = orderedStops.map((s, i) =>
          `${i + 1}. ${s.client} — ${s.address || 'okänd adress'}${s.startTime ? ` (start: ${new Date(s.startTime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })})` : ''}`
        ).join('\n');

        const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `Du är en ruttplaneringsassistent för ett eventföretag i Sverige. Ge korta, praktiska tips om rutten. Max 3-4 meningar. Svara alltid på svenska. Fokusera på: tidsfönster-konflikter, rusningstrafikvarningar, möjliga grupperingar av närliggande stopp. Datumet är ${date}.`
              },
              {
                role: 'user',
                content: `Analysera denna optimerade rutt för en medarbetare:\n\n${stopsDescription}\n\nTotal sträcka: ${totalDistanceKm} km\nBeräknad tid: ${totalDurationMin} min\n\nGe korta tips och varningar.`
              },
            ],
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiSuggestions = aiData.choices?.[0]?.message?.content || '';
        } else if (aiRes.status === 429) {
          aiSuggestions = 'AI-analys tillfälligt otillgänglig (rate limit). Rutten är fortfarande optimerad.';
        } else if (aiRes.status === 402) {
          aiSuggestions = 'AI-analys kräver krediter. Rutten är fortfarande optimerad.';
        }
      } catch (e) {
        console.error('AI analysis error:', e);
        aiSuggestions = 'Kunde inte hämta AI-analys. Rutten är optimerad baserat på avstånd.';
      }
    }

    const result: OptimizedResult = {
      optimized_order: optimizedOrder,
      stops: orderedStops,
      total_distance_km: totalDistanceKm,
      total_duration_min: totalDurationMin,
      polyline,
      ai_suggestions: aiSuggestions,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('optimize-staff-route error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
