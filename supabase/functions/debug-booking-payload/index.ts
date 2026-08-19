// @ts-nocheck
// Diagnostik: läser RÅSVARET från Booking (export_bookings) för EN bokning och
// rapporterar om produktkontraktet (`products_complete`) finns med.
// Admin-only. Muterar ingenting.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized', reason: 'missing_bearer', header_present: Boolean(authHeader) }, 401);
    }
    const token = authHeader.replace('Bearer ', '').trim();

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const body = await req.json().catch(() => ({}));
    const bookingNumber = typeof body.booking_number === 'string' ? body.booking_number.trim() : '';
    let bookingId = typeof body.booking_id === 'string' ? body.booking_id.trim() : '';

    let organizationId: string | null = null;

    if (token === serviceKey) {
      organizationId = typeof body.organization_id === 'string' ? body.organization_id : null;
      if (!organizationId) return json({ error: 'organization_id required for service calls' }, 400);
    } else {
      const { data: userData } = await admin.auth.getUser(token);
      const user = userData?.user;
      if (!user) return json({ error: 'Unauthorized' }, 401);

      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Forbidden' }, 403);

      const { data: profile } = await admin
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      organizationId = profile?.organization_id ?? null;
    }
    if (!organizationId) return json({ error: 'No organization for user' }, 400);

    if (!bookingId && bookingNumber) {
      const { data: local } = await admin
        .from('bookings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('booking_number', bookingNumber)
        .maybeSingle();
      bookingId = local?.id ?? '';
    }
    if (!bookingId) return json({ error: 'booking_id or booking_number required' }, 400);

    const apiKey = Deno.env.get('IMPORT_API_KEY');
    if (!apiKey) return json({ error: 'IMPORT_API_KEY not configured' }, 500);

    const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${encodeURIComponent(organizationId)}&booking_id=${encodeURIComponent(bookingId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      return json({ error: `External API ${res.status}`, details: (await res.text()).slice(0, 500) }, 502);
    }
    const payload = await res.json();

    const booking = payload?.booking ?? (Array.isArray(payload?.data) ? payload.data[0] : null);
    const products: any[] = Array.isArray(booking?.products) ? booking.products : [];

    return json({
      booking_id: bookingId,
      envelope_keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      booking_keys: booking && typeof booking === 'object' ? Object.keys(booking) : [],
      products_complete_root: booking?.products_complete ?? null,
      products_complete_type: typeof booking?.products_complete,
      products_complete_meta: booking?.meta?.products_complete ?? null,
      products_complete_envelope: payload?.products_complete ?? null,
      product_count: products.length,
      product_names: products.map((p) => p?.name ?? p?.product_name).filter(Boolean),
      source_updated_at: booking?.updated_at ?? booking?.source_updated_at ?? null,
    });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
