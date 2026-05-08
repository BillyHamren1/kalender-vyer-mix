/**
 * process-presence-events
 * =======================
 *
 * For a given staff/date, builds the GPS day timeline and writes
 * arrival/departure events into `staff_presence_events`.
 *
 * READ-ONLY for tids-data:
 *   - Reads:  staff_location_history, organization_locations, projects, etc.
 *             (via resolveWorkTargets)
 *   - Writes: staff_presence_events (idempotent via unique index)
 *   - NEVER writes: workdays, time_reports, location_time_entries,
 *                   travel_time_logs, active_time_registrations.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildGpsDayTimeline,
  type GpsPing,
} from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import {
  derivePresenceEvents,
  type DerivedPresenceEvent,
} from '../_shared/time-engine/derivePresenceEvents.ts';

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

interface ReqBody {
  organizationId?: string;
  staffId?: string;
  date?: string; // YYYY-MM-DD
  dryRun?: boolean;
  diagnostics?: boolean;
}

const EARTH_R = 6_371_000;
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const { organizationId, staffId } = body;
    const date = body.date || new Date().toISOString().slice(0, 10);
    const dryRun = !!body.dryRun;

    if (!organizationId || !staffId) {
      return json({ error: 'organizationId and staffId required' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Day window in UTC (good enough for ping bucketing).
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: pingRows, error: pingErr } = await supabaseAdmin
      .from('staff_location_history')
      .select('lat, lng, accuracy, speed, recorded_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('recorded_at', dayStart)
      .lte('recorded_at', dayEnd)
      .order('recorded_at', { ascending: true })
      .limit(5000);

    if (pingErr) return json({ error: pingErr.message }, 500);

    const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
      speedMps: p.speed != null ? Number(p.speed) : null,
    }));

    const { targets: resolved } = await resolveWorkTargets({
      organizationId,
      staffId,
      date,
      supabaseAdmin,
    });
    const workTargets: WorkTarget[] = resolved
      .map(toWorkTarget)
      .filter((t): t is WorkTarget => !!t);

    const timeline = buildGpsDayTimeline({
      staffId,
      organizationId,
      date,
      pings,
      targets: workTargets,
    });

    const events: DerivedPresenceEvent[] = derivePresenceEvents({
      segments: timeline.segments,
    });

    if (dryRun) {
      return json({
        dryRun: true,
        date,
        segmentCount: timeline.segments.length,
        derivedEventCount: events.length,
        events,
      });
    }

    let inserted = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    for (const ev of events) {
      const row = {
        organization_id: organizationId,
        staff_id: staffId,
        event_type: ev.eventType,
        target_type: ev.targetType,
        target_id: ev.targetId,
        target_label: ev.targetLabel,
        event_at: ev.eventAt,
        source: 'gps_geofence',
        confidence: ev.confidence,
        gps_segment_id: ev.gpsSegmentId,
        metadata: ev.metadata,
      };

      const { error: insErr } = await supabaseAdmin
        .from('staff_presence_events')
        .insert(row);

      if (insErr) {
        // 23505 = unique_violation → expected on re-run, treat as dedup.
        if ((insErr as any).code === '23505') {
          skippedDuplicates++;
        } else {
          errors.push(insErr.message);
        }
      } else {
        inserted++;
      }
    }

    return json({
      ok: true,
      date,
      segmentCount: timeline.segments.length,
      derivedEventCount: events.length,
      inserted,
      skippedDuplicates,
      errors,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
