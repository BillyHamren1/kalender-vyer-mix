/**
 * get-target-presence
 * ===================
 *
 * Returns presence roster + history for a single work target (event/project/location).
 *
 * Inputs:
 *   - organizationId
 *   - targetType: 'project' | 'large_project' | 'organization_location' | 'booking'
 *   - targetId
 *   - date (optional, YYYY-MM-DD; defaults to today)
 *
 * Output per staff:
 *   - status: 'on_site' | 'left' | 'transport' | 'unknown_place' | 'no_signal'
 *   - arrivedAt, departedAt, lastPingAt, confidence
 *   - hasActiveTimer
 *
 * Plus per-staff event history for the day (arrival + departure rows).
 *
 * READ-ONLY. Never writes time_reports / workdays / LTE / travel.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Body {
  organizationId?: string;
  targetType?: string;
  targetId?: string;
  date?: string;
}

type PresenceStatus = 'on_site' | 'left' | 'transport' | 'unknown_place' | 'no_signal';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const { organizationId, targetType, targetId } = body;
    const date = body.date || new Date().toISOString().slice(0, 10);
    if (!organizationId || !targetType || !targetId) {
      return json({ error: 'organizationId, targetType, targetId required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    // 1) All presence events for this target on this day.
    const { data: targetEvents, error: tErr } = await supabase
      .from('staff_presence_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .gte('event_at', dayStart)
      .lte('event_at', dayEnd)
      .order('event_at', { ascending: true });
    if (tErr) return json({ error: tErr.message }, 500);

    const staffIds = Array.from(new Set((targetEvents ?? []).map((e: any) => e.staff_id)));
    if (staffIds.length === 0) {
      return json({ date, target: { targetType, targetId }, roster: [], history: [] });
    }

    // 2) ALL presence events (any target) for these staff today — needed
    //    to know if they later moved to transport / another known site.
    const { data: allEvents } = await supabase
      .from('staff_presence_events')
      .select('*')
      .eq('organization_id', organizationId)
      .in('staff_id', staffIds)
      .gte('event_at', dayStart)
      .lte('event_at', dayEnd)
      .order('event_at', { ascending: true });

    // 3) Latest ping per staff (signal freshness).
    const { data: pings } = await supabase
      .from('staff_location_history')
      .select('staff_id, recorded_at, lat, lng, accuracy, speed')
      .eq('organization_id', organizationId)
      .in('staff_id', staffIds)
      .gte('recorded_at', dayStart)
      .order('recorded_at', { ascending: false })
      .limit(2000);

    const latestPing = new Map<string, any>();
    for (const p of pings ?? []) {
      if (!latestPing.has(p.staff_id)) latestPing.set(p.staff_id, p);
    }

    // 4) Active timers per staff.
    const { data: actives } = await supabase
      .from('active_time_registrations')
      .select('staff_id, status, current_label, current_target_type, current_target_id, started_at, start_source, auto_started')
      .eq('organization_id', organizationId)
      .in('staff_id', staffIds)
      .eq('status', 'active');

    const activeByStaff = new Map<string, any>();
    for (const a of actives ?? []) activeByStaff.set(a.staff_id, a);

    // 5) Staff names.
    const { data: staffRows } = await supabase
      .from('staff_members')
      .select('id, name, full_name, email')
      .eq('organization_id', organizationId)
      .in('id', staffIds);
    const nameById = new Map<string, string>();
    for (const s of staffRows ?? []) {
      nameById.set(s.id, (s as any).full_name || (s as any).name || (s as any).email || s.id);
    }

    const now = Date.now();
    const SIGNAL_STALE_MS = 15 * 60 * 1000; // 15 min

    // Build roster.
    const roster = staffIds.map((sid) => {
      const myEvents = (allEvents ?? []).filter((e: any) => e.staff_id === sid);
      const myTargetEvents = (targetEvents ?? []).filter((e: any) => e.staff_id === sid);

      // Last arrival/departure FOR THIS TARGET.
      const lastArrival = [...myTargetEvents].reverse().find((e: any) => e.event_type === 'arrival');
      const lastDeparture = [...myTargetEvents].reverse().find((e: any) => e.event_type === 'departure');

      // Determine current presence status from full timeline.
      const lastEvent = myEvents[myEvents.length - 1];
      const ping = latestPing.get(sid);
      const lastPingMs = ping ? Date.parse(ping.recorded_at) : null;
      const signalAgeMin = lastPingMs ? Math.round((now - lastPingMs) / 60000) : null;
      const signalStale = !lastPingMs || (now - lastPingMs) > SIGNAL_STALE_MS;

      let status: PresenceStatus;
      if (
        lastEvent &&
        lastEvent.event_type === 'arrival' &&
        lastEvent.target_type === targetType &&
        String(lastEvent.target_id) === String(targetId)
      ) {
        status = signalStale ? 'no_signal' : 'on_site';
      } else if (
        lastEvent &&
        lastEvent.event_type === 'departure' &&
        lastEvent.target_type === targetType &&
        String(lastEvent.target_id) === String(targetId)
      ) {
        // Departed from this target. Try to interpret what they did next.
        const speed = ping?.speed != null ? Number(ping.speed) : null;
        if (speed != null && speed > 2.5) status = 'transport';
        else if (signalStale) status = 'no_signal';
        else status = 'left';
      } else if (lastEvent && lastEvent.event_type === 'arrival') {
        // Currently somewhere else (another known site).
        status = 'left';
      } else {
        status = signalStale ? 'no_signal' : 'unknown_place';
      }

      const active = activeByStaff.get(sid);

      return {
        staffId: sid,
        name: nameById.get(sid) ?? sid,
        status,
        arrivedAt: lastArrival?.event_at ?? null,
        departedAt: lastDeparture?.event_at ?? null,
        lastPingAt: ping?.recorded_at ?? null,
        signalAgeMinutes: signalAgeMin,
        confidence: lastArrival?.confidence ?? null,
        hasActiveTimer: !!active,
        activeTimer: active
          ? {
              startedAt: active.started_at,
              currentLabel: active.current_label,
              startSource: active.start_source,
              autoStarted: active.auto_started,
            }
          : null,
      };
    });

    // History: all events for the day for these staff (any target),
    // so admin sees the full sequence around this event/project.
    const history = (allEvents ?? []).map((e: any) => ({
      id: e.id,
      staffId: e.staff_id,
      staffName: nameById.get(e.staff_id) ?? e.staff_id,
      eventType: e.event_type,
      eventAt: e.event_at,
      targetType: e.target_type,
      targetId: e.target_id,
      targetLabel: e.target_label,
      confidence: e.confidence,
      isFocusedTarget:
        e.target_type === targetType && String(e.target_id) === String(targetId),
    }));

    return json({
      date,
      target: { targetType, targetId },
      roster,
      history,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
