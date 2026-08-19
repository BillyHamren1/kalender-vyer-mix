import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pushBookingFieldsToExternal } from '../_shared/external-booking-write.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const serviceApiKey = req.headers.get('x-api-key');
  const planningApiKey = Deno.env.get('PLANNING_API_KEY');
  const cronSecretHeader = req.headers.get('x-cron-secret');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const opsKeyHeader = req.headers.get('x-ops-resync-key');
  const opsKey = Deno.env.get('OPS_RESYNC_KEY');
  const opsKeyV2 = Deno.env.get('OPS_RESYNC_KEY_V2');
  const isServiceCall =
    (!!serviceApiKey && !!planningApiKey && serviceApiKey === planningApiKey) ||
    (!!cronSecretHeader && !!cronSecret && cronSecretHeader === cronSecret) ||
    (!!opsKeyHeader && !!opsKey && opsKeyHeader === opsKey) ||
    (!!opsKeyHeader && !!opsKeyV2 && opsKeyHeader === opsKeyV2);



  const authHeader = req.headers.get('Authorization');
  if (!authHeader && !isServiceCall) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
  if (!bookingId) return json({ error: 'booking_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let userId: string | null = null;
  if (!isServiceCall) {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader! } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return json({ error: 'Unauthorized' }, 401);
    userId = auth.user.id;
  }

  const admin = createClient(url, serviceKey);
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select('id, organization_id, booking_number')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingError || !booking) return json({ error: 'Booking not found' }, 404);

  // Tenant authorization: caller must belong to the same organization.
  if (!isServiceCall) {
    const { data: profile } = await admin.from('profiles').select('organization_id').eq('id', userId!).maybeSingle();
    if (!profile || profile.organization_id !== booking.organization_id) return json({ error: 'Forbidden' }, 403);
  }


  const [tasksRes, transportRes, calendarRes] = await Promise.all([
    admin.from('establishment_tasks')
      .select('id,title,category,start_date,end_date,start_time,end_time,status,task_type,description,sort_order,source_product_id,source_product_ids,source_product_quantities')
      .eq('booking_id', bookingId)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false }),
    admin.from('transport_assignments')
      .select('id,transport_date,transport_time,estimated_duration,pickup_address,status,stop_order,driver_notes,vehicle:vehicles!vehicle_id(id,name,vehicle_type,is_external)')
      .eq('booking_id', bookingId)
      .order('transport_date', { ascending: true })
      .order('transport_time', { ascending: true, nullsFirst: false }),
    admin.from('calendar_events')
      .select('id,title,start_time,end_time,event_type,source_date,resource_id')
      .eq('booking_id', bookingId)
      .in('event_type', ['rig','rigDown','rigdown'])
      .order('start_time', { ascending: true }),
  ]);

  if (tasksRes.error || transportRes.error || calendarRes.error) {
    return json({ error: 'Could not build operational projection', details: [tasksRes.error?.message, transportRes.error?.message, calendarRes.error?.message].filter(Boolean) }, 500);
  }

  // Product catalogue for the booking – so Booking knows WHAT is being rigged, not just "Rigg".
  const { data: bookingProducts } = await admin
    .from('booking_products')
    .select('id,name,quantity,sku,parent_product_id,notes')
    .eq('booking_id', bookingId);
  const productById = new Map<string, any>((bookingProducts || []).map((p: any) => [p.id, p]));

  const resolveProducts = (t: any) => {
    const ids: string[] = Array.isArray(t.source_product_ids) && t.source_product_ids.length
      ? t.source_product_ids
      : (t.source_product_id ? [t.source_product_id] : []);
    const qty = (t.source_product_quantities || {}) as Record<string, number>;
    return ids
      .map((id) => {
        const p = productById.get(id);
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          quantity: Number(qty?.[id] ?? p.quantity ?? 1),
          is_accessory: !!p.parent_product_id,
          notes: p.notes ?? null,
        };
      })
      .filter(Boolean);
  };

  const calendar = calendarRes.data || [];
  const firstProjectStart = calendar.find((e: any) => e?.start_time)?.start_time || null;
  const startTimeOnSite = firstProjectStart ? new Date(firstProjectStart).toISOString().slice(11, 16) : null;
  const startDateOnSite = firstProjectStart ? new Date(firstProjectStart).toISOString().slice(0, 10) : null;

  const operationalPlan = {
    schema_version: 1,
    booking_id: bookingId,
    booking_number: booking.booking_number,
    generated_at: new Date().toISOString(),
    start_time_on_site: startTimeOnSite,
    start_date_on_site: startDateOnSite,
    schedule_items: (tasksRes.data || []).map((t: any) => ({
      id: t.id, type: 'planning_item', title: t.title, category: t.category,
      date: t.start_date, end_date: t.end_date, start_time: t.start_time, end_time: t.end_time,
      status: t.status, task_type: t.task_type, description: t.description, sort_order: t.sort_order,
      products: resolveProducts(t),
      product_summary: resolveProducts(t).map((p: any) => (p.quantity > 1 ? `${p.quantity}× ${p.name}` : p.name)).join(', ') || null,
      label: [t.title, resolveProducts(t).map((p: any) => p.name).join(', ')].filter(Boolean).join(' – '),
    })),
    transports: (transportRes.data || []).map((t: any) => ({
      id: t.id, type: 'transport', date: t.transport_date, time: t.transport_time,
      estimated_duration: t.estimated_duration, pickup_address: t.pickup_address,
      status: t.status, stop_order: t.stop_order, driver_notes: t.driver_notes,
      vehicle: t.vehicle ? { id: t.vehicle.id, name: t.vehicle.name, vehicle_type: t.vehicle.vehicle_type, is_external: t.vehicle.is_external } : null,
    })),
  };

  const result = await pushBookingFieldsToExternal({
    bookingId,
    organizationId: booking.organization_id,
    fields: {
      operational_plan: operationalPlan,
      start_time_on_site: startTimeOnSite,
      operational_plan_updated_at: operationalPlan.generated_at,
    },
  });
  return json({ success: result.ok, booking_id: bookingId, upstream_status: result.status, upstream: result.body }, result.ok ? 200 : 502);
});
