// @ts-nocheck
// Reverse-geocodes any staff_locations rows where last_address IS NULL.
// Called on-demand from the time-reports page (no cron). Uses Mapbox.
// Idempotent + cheap: writes only the address columns; the BEFORE trigger
// `invalidate_stale_staff_address` already nulls them out when the staff
// has moved >100m or the cache is older than 1h.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Row {
  staff_id: string;
  latitude: number | null;
  longitude: number | null;
}

const trimAddress = (full: string): string => {
  // Mapbox returns "Holmträskvägen 19, 121 00 Johanneshov, Sweden".
  // We only want the street + number (first segment).
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  return parts[0] || full;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
  if (!mapboxToken) {
    return new Response(JSON.stringify({ error: 'MAPBOX_PUBLIC_TOKEN missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let body: { staff_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch { /* empty body = process all stale rows */ }

  let query = supabase
    .from('staff_locations')
    .select('staff_id, latitude, longitude')
    .is('last_address', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (Array.isArray(body.staff_ids) && body.staff_ids.length > 0) {
    query = query.in('staff_id', body.staff_ids);
  }

  const { data: rows, error } = await query.limit(50);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stale = (rows || []) as Row[];
  let updated = 0;
  const errors: string[] = [];

  // Sequential to avoid hammering Mapbox; lists are tiny (<= 50).
  for (const r of stale) {
    if (r.latitude == null || r.longitude == null) continue;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${r.longitude},${r.latitude}.json?access_token=${mapboxToken}&language=sv&types=address,poi&limit=1`;
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`mapbox ${res.status} for ${r.staff_id}`);
        continue;
      }
      const data = await res.json();
      const feature = data.features?.[0];
      const placeName: string | undefined = feature?.place_name;
      if (!placeName) continue;
      const address = trimAddress(placeName);

      const { error: updErr } = await supabase
        .from('staff_locations')
        .update({
          last_address: address,
          last_address_at: new Date().toISOString(),
          last_address_lat: r.latitude,
          last_address_lng: r.longitude,
        })
        .eq('staff_id', r.staff_id);

      if (updErr) errors.push(`update ${r.staff_id}: ${updErr.message}`);
      else updated++;
    } catch (e) {
      errors.push(`exception ${r.staff_id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ scanned: stale.length, updated, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});