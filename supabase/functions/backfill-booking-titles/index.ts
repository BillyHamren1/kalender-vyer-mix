// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { organizationId } = await req.json().catch(() => ({}));
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const importApiKey = Deno.env.get('IMPORT_API_KEY');
    if (!importApiKey) throw new Error('IMPORT_API_KEY missing');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${encodeURIComponent(organizationId)}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${importApiKey}`,
        'x-api-key': importApiKey,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`External API ${resp.status}: ${t.slice(0, 300)}`);
    }
    const payload = await resp.json();
    const list: any[] = Array.isArray(payload) ? payload : (payload.bookings ?? payload.data ?? []);

    const sampleKeys = list[0] ? Object.keys(list[0]) : [];
    const sample = list[0] ? { id: list[0].id, title: list[0].title, name: list[0].name, project_name: list[0].project_name, event_name: list[0].event_name, client: list[0].client, client_name: list[0].client_name } : null;
    if ((req.headers.get('x-debug') || '') === '1') {
      return new Response(JSON.stringify({ totalFromApi: list.length, sampleKeys, sample }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let updated = 0;
    let missing = 0;
    let unchanged = 0;
    const errors: string[] = [];

    // Update only title — minimal write
    for (const b of list) {
      const externalId = b.id;
      const title = (b.title ?? b.name ?? b.location ?? null);
      if (!externalId) { missing++; continue; }
      if (!title) { unchanged++; continue; }
      const { error, count } = await supabase
        .from('bookings')
        .update({ title }, { count: 'exact' })
        .eq('id', externalId)
        .eq('organization_id', organizationId);
      if (error) { errors.push(`${externalId}: ${error.message}`); continue; }
      if (count && count > 0) updated++; else missing++;
    }

    // Refresh calendar_events titles to "<title> – <client>"
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, title, client, booking_number')
      .eq('organization_id', organizationId)
      .not('title', 'is', null);

    let eventsUpdated = 0;
    for (const b of bookings ?? []) {
      const newBase = b.title ? `${b.title} – ${b.client}` : b.client;
      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, event_type, title')
        .eq('booking_id', b.id);
      for (const ev of events ?? []) {
        // Preserve any phase prefix used by import (Packning -, Utleverans -, Event -, etc.)
        const prefixMatch = (ev.title || '').match(/^(Packning|Utleverans|Event|Återleverans|Inventering|Upppackning)\s+-\s+/);
        const desired = prefixMatch ? `${prefixMatch[1]} - ${newBase}` : newBase;
        if (ev.title !== desired) {
          await supabase.from('calendar_events').update({ title: desired }).eq('id', ev.id);
          eventsUpdated++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true, totalFromApi: list.length, updated, missing, unchanged, eventsUpdated, errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
