// Central skrivväg för bokningsfält från Planning.
// All skrivning går till Bookings update-booking-from-planning.
// Planning spegelskriver ALDRIG Booking-ägda fält lokalt här.
// Produktändringar är fail-closed (read-only) tills Booking exponerar en säker skrivväg.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pushBookingFieldsToExternal } from '../_shared/external-booking-write.ts';
import { assertPlanningAccess } from '../_shared/planningAccess.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ALLOWED_CANONICAL_FIELDS = new Set([
  'rig_up_dates',
  'event_dates',
  'rig_down_dates',
  'rig_up_time',
  'rig_down_time',
  'delivery_address',
  'delivery_city',
  'delivery_postal_code',
  'delivery_geocode',
  'delivery_contact_name',
  'delivery_contact_phone',
  'contact_name',
  'contact_email',
  'contact_phone',
  'internal_notes',
  'carry_more_than_10m',
  'ground_nails_allowed',
  'exact_time_needed',
  'exact_time_info',
  'rental_only',
  'status',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const resource = typeof body?.resource === 'string' ? body.resource : 'booking';

    if (resource !== 'booking') {
      // Fail-closed: produkter/övriga resurser saknar säker central skrivväg.
      return json({
        error: 'read_only_resource',
        message:
          `Planning kan inte skriva "${resource}". Bokningsprodukter ägs av Booking och saknar central skrivväg.`,
      }, 409);
    }

    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : '';
    const fields = (body?.fields && typeof body.fields === 'object') ? body.fields as Record<string, unknown> : null;
    if (!bookingId) return json({ error: 'booking_id krävs' }, 400);
    if (!fields || Object.keys(fields).length === 0) return json({ error: 'fields krävs' }, 400);

    const rejected = Object.keys(fields).filter((k) => !ALLOWED_CANONICAL_FIELDS.has(k));
    if (rejected.length > 0) {
      return json({ error: 'unsupported_fields', fields: rejected }, 400);
    }

    // Server-side org-resolution — klientens organization_id ignoreras.
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // Behörighetssteg FÖRE all service-role-läsning/skrivning. JWT räcker inte ensam.
    const access = await assertPlanningAccess(service as never, userData.user.id);
    if (!access.ok) return json({ error: access.error, message: access.message }, access.status);
    const organizationId = access.organizationId;

    const result = await pushBookingFieldsToExternal({
      bookingId,
      organizationId,
      fields: fields as never,
    });

    if (!result.ok) {
      return json({ error: 'booking_write_failed', status: result.status, body: result.body }, 502);
    }

    return json({ success: true, booking_id: bookingId, applied_fields: Object.keys(fields) });
  } catch (error) {
    console.error('[booking-source-write]', error);
    return json({ error: (error as Error).message ?? 'Internal server error' }, 500);
  }
});
