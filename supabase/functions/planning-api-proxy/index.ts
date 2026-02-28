import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchFromExternal(
  efUrl: string,
  planningApiKey: string,
  type: string,
  bookingId: string
): Promise<any> {
  const qs = new URLSearchParams({ type, booking_id: bookingId });
  const res = await fetch(`${efUrl}/functions/v1/planning-api?${qs.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': planningApiKey,
    },
  });
  return res.json();
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

    // === MULTI_BATCH: fetch all economy data for multiple bookings in one call ===
    if (type === 'multi_batch' && params.booking_ids) {
      const bookingIds: string[] = params.booking_ids;
      const dataTypes = ['budget', 'time_reports', 'purchases', 'quotes', 'invoices', 'product_costs', 'supplier_invoices'];

      // Fire ALL requests in parallel (bookings × dataTypes) instead of nesting
      const flatPromises: Array<{ bid: string; t: string; promise: Promise<any> }> = [];
      for (const bid of bookingIds) {
        for (const t of dataTypes) {
          flatPromises.push({
            bid,
            t,
            promise: fetchFromExternal(efUrl, planningApiKey, t, bid).catch(() => null),
          });
        }
      }

      const results = await Promise.all(flatPromises.map((p) => p.promise));

      const responseData: Record<string, any> = {};
      flatPromises.forEach(({ bid, t }, i) => {
        if (!responseData[bid]) responseData[bid] = {};
        responseData[bid][t] = results[i];
      });

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === BATCH: fetch all economy data in one call ===
    if (type === 'batch' && params.booking_id) {
      const bookingId = params.booking_id;
      const dataTypes = ['budget', 'time_reports', 'purchases', 'quotes', 'invoices', 'product_costs', 'supplier_invoices'];

      const results = await Promise.all(
        dataTypes.map((t) =>
          fetchFromExternal(efUrl, planningApiKey, t, bookingId).catch(() => null)
        )
      );

      const responseData: Record<string, any> = {};
      dataTypes.forEach((t, i) => {
        responseData[t] = results[i];
      });

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

    const response = await fetch(targetUrl, fetchOptions);
    const responseData = await response.json();

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
