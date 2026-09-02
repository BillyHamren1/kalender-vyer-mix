// Live läsväg för bokningsdetaljen.
// Booking-projektet är ensam ägare till bokningsfält och bokningsprodukter.
// Denna funktion hämtar den aktuella bokningen från Bookings export_bookings-kontrakt
// och returnerar den tillsammans med Plannings LOKALA fält (viewed, assigned_project_*).
//
// organization_id fastställs ALLTID på servern utifrån användarens profil.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertPlanningAccess } from '../_shared/planningAccess.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTERNAL_BASE = 'https://wpzhsmrbjmxglowyoyky.supabase.co';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : '';
    if (!bookingId) return json({ error: 'booking_id krävs' }, 400);

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Behörighetssteg FÖRE all service-role-läsning. JWT räcker inte ensam.
    // Server-side org-resolution — klientens organization_id ignoreras alltid.
    const access = await assertPlanningAccess(service as never, userData.user.id);
    if (!access.ok) return json({ error: access.error, message: access.message }, access.status);
    const organizationId = access.organizationId;

    const apiKey = Deno.env.get('IMPORT_API_KEY') ?? Deno.env.get('PLANNING_API_KEY');
    if (!apiKey) return json({ error: 'Server configuration error' }, 500);

    const qs = new URLSearchParams({ organization_id: organizationId, booking_id: bookingId });
    const res = await fetch(`${EXTERNAL_BASE}/functions/v1/export_bookings?${qs.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return json({ error: 'booking_source_unavailable', status: res.status, detail }, 502);
    }

    const payload = await res.json().catch(() => null);
    let canonical: Record<string, unknown> | null = null;
    if (payload && typeof payload === 'object') {
      if (typeof (payload as any).found === 'boolean') {
        canonical = (payload as any).found ? (payload as any).booking ?? null : null;
      } else if (Array.isArray((payload as any).data)) {
        canonical = (payload as any).data.find((b: any) => String(b?.id) === bookingId)
          ?? (payload as any).data[0] ?? null;
      } else if (Array.isArray((payload as any).bookings)) {
        canonical = (payload as any).bookings[0] ?? null;
      }
    }

    if (!canonical) return json({ error: 'booking_not_found_in_source' }, 404);

    // Planning-lokala fält (tenant-scopeade) — läggs ovanpå i klienten.
    const { data: local } = await service
      .from('bookings')
      .select('viewed, assigned_project_id, assigned_project_name, assigned_to_project')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    return json({ booking: canonical, planning_local: local ?? null, source: 'booking_export' });
  } catch (error) {
    console.error('[booking-source-read]', error);
    return json({ error: (error as Error).message ?? 'Internal server error' }, 500);
  }
});
