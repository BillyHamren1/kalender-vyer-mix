// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchEconomyBatch,
  fetchEconomyType,
  hasValidProductCosts,
  type EconomyDataType,
} from './economy-fetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CHUNK_SIZE = 10; // Fetch at most 10 bookings in parallel

async function fetchFromExternal(
  efUrl: string,
  planningApiKey: string,
  type: string,
  bookingId: string
): Promise<any> {
  return fetchEconomyType(fetch, efUrl, planningApiKey, type as EconomyDataType, bookingId);
}

/** Fetch all 7 data types for a single booking */
async function fetchAllForBooking(
  efUrl: string,
  planningApiKey: string,
  bookingId: string
): Promise<Record<string, any>> {
  return fetchEconomyBatch(fetch, efUrl, planningApiKey, bookingId);
}

/** Process bookings in chunks of CHUNK_SIZE */
async function fetchInChunks(
  efUrl: string,
  planningApiKey: string,
  bookingIds: string[]
): Promise<Record<string, Record<string, any>>> {
  const result: Record<string, Record<string, any>> = {};
  for (let i = 0; i < bookingIds.length; i += CHUNK_SIZE) {
    const chunk = bookingIds.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (bid) => ({
        bid,
        data: await fetchAllForBooking(efUrl, planningApiKey, bid),
      }))
    );
    chunkResults.forEach(({ bid, data }) => { result[bid] = data; });
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT - user must be authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get external API config
    const efUrl = Deno.env.get('EF_SUPABASE_URL');
    const planningApiKey = Deno.env.get('PLANNING_API_KEY');
    if (!efUrl || !planningApiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json();
    const { type, method = 'GET', ...params } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing "type" parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === MULTI_BATCH: fetch all economy data for multiple bookings ===
    if (type === 'multi_batch' && params.booking_ids) {
      const bookingIds: string[] = Array.isArray(params.booking_ids)
        ? [...new Set(params.booking_ids.filter((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 500)
        : [];
      if (bookingIds.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid booking_ids' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Use service_role client for cache access (bypasses RLS)
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const now = Date.now();
      const responseData: Record<string, any> = {};

      // 1. Check cache for all booking IDs
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userData.user.id)
        .single();
      const orgId = profile?.organization_id;
      if (!orgId) {
        return new Response(JSON.stringify({ error: 'Organization context missing' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Chunk IN-lists: hundreds of UUIDs in one URL overflow the request line.
      const ID_CHUNK = 100;
      const idChunks: string[][] = [];
      for (let i = 0; i < bookingIds.length; i += ID_CHUNK) idChunks.push(bookingIds.slice(i, i + ID_CHUNK));
      const scopedBookings: { id: string }[] = [];
      for (const chunk of idChunks) {
        const { data, error: scopedBookingsError } = await serviceClient
          .from('bookings')
          .select('id')
          .eq('organization_id', orgId)
          .in('id', chunk);
        if (scopedBookingsError) throw scopedBookingsError;
        scopedBookings.push(...(data ?? []));
      }
      const allowedIds = new Set((scopedBookings ?? []).map((booking: { id: string }) => booking.id));
      // Fail-closed per ID: IDs outside the caller's org (or deleted/unknown) are
      // dropped instead of failing the whole batch. Only allowed IDs are processed.
      const deniedCount = bookingIds.length - allowedIds.size;
      if (deniedCount > 0) console.warn(`[multi_batch] skipped ${deniedCount} booking id(s) not in org ${orgId}`);
      const permittedIds = bookingIds.filter((id) => allowedIds.has(id));
      bookingIds.length = 0;
      bookingIds.push(...permittedIds);
      idChunks.length = 0;
      for (let i = 0; i < bookingIds.length; i += ID_CHUNK) idChunks.push(bookingIds.slice(i, i + ID_CHUNK));
      if (bookingIds.length === 0) {
        return new Response(JSON.stringify({ data: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const cached: any[] = [];
      for (const chunk of idChunks) {
        const { data } = await serviceClient
          .from('economy_cache')
          .select('booking_id, data, cached_at')
          .eq('organization_id', orgId)
          .in('booking_id', chunk);
        cached.push(...(data ?? []));
      }

      const uncachedIds: string[] = [];

      for (const bid of bookingIds) {
        const entry = cached?.find((c: any) => c.booking_id === bid);
        if (entry && hasValidProductCosts(entry.data) && (now - new Date(entry.cached_at).getTime()) < CACHE_TTL_MS) {
          // Cache hit — use cached data
          responseData[bid] = entry.data;
        } else {
          uncachedIds.push(bid);
        }
      }

      // 2. Fetch uncached bookings in chunks
      if (uncachedIds.length > 0) {
        console.log(`Cache miss for ${uncachedIds.length}/${bookingIds.length} bookings, fetching externally...`);
        const freshData = await fetchInChunks(efUrl, planningApiKey, uncachedIds);

        // 3. Upsert fresh data into cache
        const upsertRows = Object.entries(freshData)
          .filter(([, data]) => hasValidProductCosts(data))
          .map(([bid, data]) => ({
          booking_id: bid,
          data,
          cached_at: new Date().toISOString(),
          organization_id: orgId,
        }));
        if (upsertRows.length > 0) {
          await serviceClient
            .from('economy_cache')
            .upsert(upsertRows, { onConflict: 'booking_id' });
        }

        // Merge into response
        Object.entries(freshData).forEach(([bid, data]) => {
          responseData[bid] = data;
        });
      } else {
        console.log(`Full cache hit for all ${bookingIds.length} bookings`);
      }

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === BATCH: fetch all economy data in one call ===
    if (type === 'batch' && params.booking_id) {
      const bookingId = params.booking_id;
      const responseData = await fetchAllForBooking(efUrl, planningApiKey, bookingId);

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Standard single-type request ===
    const queryParams = new URLSearchParams();
    queryParams.set('type', type);
    
    for (const [key, value] of Object.entries(params)) {
      if (key === 'data') continue;
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }

    const targetUrl = `${efUrl}/functions/v1/planning-api?${queryParams.toString()}`;

    const fetchOptions: RequestInit = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': planningApiKey,
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(method) && params.data) {
      fetchOptions.body = JSON.stringify(params.data);
    }

    // Log close_project and reopen_project calls for debugging
    if (type === 'close_project' || type === 'reopen_project') {
      console.log(`[${type}] Sending to: ${targetUrl}`);
      console.log(`[${type}] Method: ${method}, Body: ${fetchOptions.body ?? 'none'}`);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseData = await response.json();

    // Log close_project response for debugging
    if (type === 'close_project' || type === 'reopen_project') {
      console.log(`[${type}] Response status: ${response.status}`);
      console.log(`[${type}] Response data: ${JSON.stringify(responseData)}`);
    }

    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Planning API proxy error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
