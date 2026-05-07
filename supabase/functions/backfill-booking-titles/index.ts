// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function chunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function runBackfill(organizationId: string, importApiKey: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Fetch all external bookings (paginated)
  const PAGE_SIZE = 200;
  const externalList: any[] = [];
  let page = 1;
  while (page <= 50) {
    const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${encodeURIComponent(organizationId)}&page=${page}&limit=${PAGE_SIZE}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${importApiKey}`, 'x-api-key': importApiKey, 'Content-Type': 'application/json' },
    });
    if (!resp.ok) {
      console.error(`Backfill: external API ${resp.status} on page ${page}`);
      break;
    }
    const payload = await resp.json();
    const chunk: any[] = Array.isArray(payload) ? payload : (payload.bookings ?? payload.data ?? []);
    externalList.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Backfill: fetched ${externalList.length} external bookings`);

  // 2. Fetch existing local titles
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, title, client')
    .eq('organization_id', organizationId);
  const existingMap = new Map<string, { title: string | null; client: string | null }>(
    (existing ?? []).map((b: any) => [b.id, { title: b.title, client: b.client }])
  );

  // 3. Compute updates needed
  type Upd = { id: string; title: string };
  const updates: Upd[] = [];
  for (const b of externalList) {
    const id = b.id;
    if (!id || !existingMap.has(id)) continue;
    const newTitle = (b.title ?? b.name ?? b.location ?? null);
    if (!newTitle) continue;
    if (existingMap.get(id)!.title === newTitle) continue;
    updates.push({ id, title: newTitle });
  }
  console.log(`Backfill: ${updates.length} bookings need title update`);

  // 4. Apply booking updates in parallel chunks
  let updated = 0;
  await chunked(updates, 20, async (u) => {
    const { error } = await supabase
      .from('bookings')
      .update({ title: u.title })
      .eq('id', u.id)
      .eq('organization_id', organizationId);
    if (!error) {
      updated++;
      const cur = existingMap.get(u.id)!;
      cur.title = u.title;
    } else {
      console.error(`Backfill update failed for ${u.id}:`, error.message);
    }
  });

  // 5. Refresh calendar_events titles only for updated bookings
  const updatedIds = updates.map(u => u.id);
  let eventsUpdated = 0;
  if (updatedIds.length > 0) {
    // Pull events for affected bookings in chunks of 100
    for (let i = 0; i < updatedIds.length; i += 100) {
      const slice = updatedIds.slice(i, i + 100);
      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, booking_id, title')
        .in('booking_id', slice);
      const evUpdates: { id: string; title: string }[] = [];
      for (const ev of events ?? []) {
        const meta = existingMap.get(ev.booking_id);
        if (!meta) continue;
        const base = meta.title ? `${meta.title} – ${meta.client}` : meta.client;
        const prefixMatch = (ev.title || '').match(/^(Packning|Utleverans|Event|Återleverans|Inventering|Upppackning)\s+-\s+/);
        const desired = prefixMatch ? `${prefixMatch[1]} - ${base}` : base;
        if (ev.title !== desired) evUpdates.push({ id: ev.id, title: desired! });
      }
      await chunked(evUpdates, 20, async (u) => {
        const { error } = await supabase.from('calendar_events').update({ title: u.title }).eq('id', u.id);
        if (!error) eventsUpdated++;
      });
    }
  }

  console.log(`Backfill complete: ${updated} bookings, ${eventsUpdated} events updated`);
}

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

    // Run in background to avoid HTTP timeout
    // @ts-ignore EdgeRuntime is available in Supabase Edge runtime
    EdgeRuntime.waitUntil(runBackfill(organizationId, importApiKey));

    return new Response(JSON.stringify({ success: true, started: true, message: 'Backfill running in background' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
