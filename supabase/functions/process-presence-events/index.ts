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
import { fetchAllStaffLocationPings } from '../_shared/timeEngine/fetchAllStaffLocationPings.ts';

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

    const ownPingFetch = await fetchAllStaffLocationPings({
      supabaseAdmin,
      organizationId,
      staffId,
      startUtc: dayStart,
      endUtc: dayEnd,
    });
    const pingRows = ownPingFetch.rows;
    const pingFetchDiagnostics = ownPingFetch.diagnostics;
    if (pingFetchDiagnostics.errorMessage) {
      return json({ error: pingFetchDiagnostics.errorMessage }, 500);
    }

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

    if (dryRun || body.diagnostics) {
      const targetsWithCoordinates = resolved.filter((t) => t.latitude != null && t.longitude != null).length;
      const targetsWithoutCoordinates = resolved.length - targetsWithCoordinates;
      const validTargets = resolved.filter((t) => t.targetValidity === 'valid').length;
      const invalidTargets = resolved.length - validTargets;
      const excludedByReason: Record<string, number> = {};
      for (const t of resolved) {
        if (t.targetValidity !== 'valid') {
          excludedByReason[t.targetValidity] = (excludedByReason[t.targetValidity] ?? 0) + 1;
        }
      }
      const autostartableTargets = resolved.filter(
        (t) => t.targetValidity === 'valid' && t.timeTrackingAllowed,
      ).length;

      const stays = timeline.segments.filter((s) => s.kind === 'stay');
      const knownStayCount = stays.filter((s) => s.type === 'known_site').length;
      const unknownStayCount = stays.filter((s) => s.type === 'unknown_place').length;

      const segmentsWithDiag = stays.map((s) => {
        const cLat = s.centerLat!;
        const cLng = s.centerLng!;
        const ranked = resolved
          .map((t) => {
            const hasCoords = t.latitude != null && t.longitude != null;
            const distanceMeters = hasCoords
              ? haversineM(cLat, cLng, t.latitude!, t.longitude!)
              : null;
            const radius = t.radiusMeters ?? 100;
            const insideRadius = distanceMeters != null ? distanceMeters <= radius : false;
            const excludedReason = t.targetValidity !== 'valid'
              ? t.targetValidity
              : !hasCoords
                ? 'missing_coordinates'
                : !insideRadius
                  ? 'outside_radius'
                  : null;
            return {
              target_id: t.id,
              target_label: t.name,
              target_type: t.type,
              targetSource: t.targetSource,
              targetValidity: t.targetValidity,
              timeTrackingAllowed: t.timeTrackingAllowed,
              lat: t.latitude,
              lng: t.longitude,
              radiusMeters: radius,
              distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
              insideRadius,
              excludedReason,
            };
          })
          .sort((a, b) => {
            if (a.distanceMeters == null) return 1;
            if (b.distanceMeters == null) return -1;
            return a.distanceMeters - b.distanceMeters;
          });

        return {
          segment: {
            id: s.id,
            startTs: s.startTs,
            endTs: s.endTs,
            durationMin: s.durationMin,
            centerLat: cLat,
            centerLng: cLng,
            pingCount: s.pingCount,
            label: s.label,
            reason: s.reason,
            type: s.type,
          },
          nearestTargets: ranked.slice(0, 5),
        };
      });

      let closestOverall: { distanceMeters: number; target_label: string; target_id: string } | null = null;
      for (const sd of segmentsWithDiag) {
        const top = sd.nearestTargets[0];
        if (top && top.distanceMeters != null) {
          if (!closestOverall || top.distanceMeters < closestOverall.distanceMeters) {
            closestOverall = {
              distanceMeters: top.distanceMeters,
              target_label: top.target_label,
              target_id: top.target_id,
            };
          }
        }
      }

      const targetDebugSummary = {
        totalTargets: resolved.length,
        targetsWithCoordinates,
        targetsWithoutCoordinates,
        autostartableTargets,
        validTargets,
        invalidTargets,
        excludedByReason,
        closestTargetOverall: closestOverall,
      };

      const longestStays = [...segmentsWithDiag]
        .sort((a, b) => b.segment.durationMin - a.segment.durationMin)
        .slice(0, 10);

      return json({
        dryRun: !!dryRun,
        diagnostics: !!body.diagnostics,
        date,
        rawPingCount: pings.length,
        gpsDayTimelineCount: timeline.segments.length,
        knownStayCount,
        unknownStayCount,
        targetDebugSummary,
        longestStays,
        derivedEventCount: events.length,
        events: dryRun ? events : undefined,
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
