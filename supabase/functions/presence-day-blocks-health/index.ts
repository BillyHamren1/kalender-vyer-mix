// @ts-nocheck
/**
 * presence-day-blocks-health
 * ──────────────────────────
 * Health check for the deterministic presence-day-blocks engine.
 *
 * Runs buildGpsDayTimeline → buildPresenceDayBlocks across ALL staff in the
 * caller's organization for each requested date and aggregates the results.
 *
 * READ-ONLY. NEVER writes anything. NEVER touches workdays / time_reports /
 * location_time_entries / travel_time_logs. NEVER changes auto-start.
 *
 * POST body:
 *   { dates: ["2026-05-06", "2026-05-07", "2026-05-08"], organizationId? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  buildGpsDayTimeline,
  type GpsPing,
} from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { buildPresenceDayBlocks } from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { fetchAllStaffLocationPings } from '../_shared/timeEngine/fetchAllStaffLocationPings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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

interface LongGapEntry {
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  previousBlock: { kind: string; targetLabel: string | null; endAt: string } | null;
  nextBlock: { kind: string; targetLabel: string | null; startAt: string } | null;
  distanceBetweenPreviousAndNextMeters: number | null;
  decision: string;
}

interface SampleBlock {
  kind: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  targetLabel: string | null;
  confidence: string | null;
  signalGapMinutes: number;
  sourceSegmentIdsCount: number;
  hiddenRawSegmentIdsCount: number;
}
interface SampleStaffDay {
  staffName: string;
  staffId: string;
  gpsDayTimelineCount: number;
  rawEvidenceBlocksCount: number;
  presenceDayBlocksCount: number;
  blocks: SampleBlock[];
}
interface DayHealth {
  date: string;
  staffCount: number;
  rawPingCount: number;
  gpsDayTimelineCount: number;
  rawEvidenceBlocksCount: number;
  presenceDayBlocksCount: number;
  compressionRatio: number;
  blocksByKind: Record<string, number>;
  evidenceBlocksByKind: Record<string, number>;
  confirmedOnSiteMinutes: number;
  probableOnSiteMinutes: number;
  signalGapMinutes: number;
  uncertainTransitionMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewCount: number;
  longestSignalGaps: LongGapEntry[];
  warnings: string[];
  unknownEvidenceBlocksCount: number;
  unknownPresenceBlocksCount: number;
  unknownCompressionRatio: number;
  transportEvidenceBlocksCount: number;
  transportPresenceBlocksCount: number;
  transportCompressionRatio: number;
  sampleStaffDays?: SampleStaffDay[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ── Auth ──
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!bearer) return json(401, { ok: false, error: 'unauthorized' });

    const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
    const okSvc =
      (SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE) ||
      (CRON_SECRET.length > 0 && bearer === CRON_SECRET) ||
      (ANON_KEY.length > 0 && bearer === ANON_KEY);
    let userOrgId: string | null = null;
    if (!okSvc) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return json(401, { ok: false, error: 'unauthorized' });
      const { data: prof } = await userClient
        .from('profiles')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      userOrgId = prof?.organization_id ?? null;
      if (!userOrgId) return json(403, { ok: false, error: 'no_org' });
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const dates: string[] = Array.isArray(body?.dates) && body.dates.length > 0
      ? body.dates.filter((d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : ['2026-05-06', '2026-05-07', '2026-05-08'];
    const orgId: string | null = okSvc ? (body?.organizationId ?? null) : userOrgId;
    if (!orgId) return json(400, { ok: false, error: 'organizationId_required' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ── Staff list ──
    const { data: staff } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('organization_id', orgId);
    const staffList = staff ?? [];

    const perDay: DayHealth[] = [];

    for (const date of dates) {
      const dayStart = `${date}T00:00:00Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      const day: DayHealth = {
        date,
        staffCount: staffList.length,
        rawPingCount: 0,
        gpsDayTimelineCount: 0,
        rawEvidenceBlocksCount: 0,
        presenceDayBlocksCount: 0,
        compressionRatio: 1,
        blocksByKind: {},
        evidenceBlocksByKind: {},
        confirmedOnSiteMinutes: 0,
        probableOnSiteMinutes: 0,
        signalGapMinutes: 0,
        uncertainTransitionMinutes: 0,
        transportMinutes: 0,
        unknownMinutes: 0,
        needsReviewCount: 0,
        longestSignalGaps: [],
        warnings: [],
        unknownEvidenceBlocksCount: 0,
        unknownPresenceBlocksCount: 0,
        unknownCompressionRatio: 1,
        transportEvidenceBlocksCount: 0,
        transportPresenceBlocksCount: 0,
        transportCompressionRatio: 1,
        sampleStaffDays: [],
      };
      const samples: SampleStaffDay[] = [];
      const sampleLimit: number = Math.max(0, Math.min(10, Number(body?.sampleStaffDayCount ?? 2)));

      const allLongGaps: LongGapEntry[] = [];

      // Resolve targets ONCE per day (same for whole org day)
      let targets: WorkTarget[] = [];
      try {
        const { targets: resolved } = await resolveWorkTargets({
          organizationId: orgId,
          // resolveWorkTargets accepts staffId; we pass first staff just for
          // BSA hint context — the org-level targets are what matter here.
          staffId: staffList[0]?.id ?? '00000000-0000-0000-0000-000000000000',
          date,
          supabaseAdmin: admin,
        });
        targets = resolved.map(toWorkTarget).filter((t): t is WorkTarget => !!t);
      } catch (e) {
        day.warnings.push(`target_resolve_failed: ${(e as any)?.message ?? e}`);
      }

      for (const s of staffList) {
        // Pings for this staff/day (canonical paginated reader)
        const pingFetch = await fetchAllStaffLocationPings({
          supabaseAdmin: admin,
          organizationId: orgId,
          staffId: s.id,
          startUtc: dayStart,
          endUtc: dayEnd,
        });
        const pingRows = pingFetch.rows;
        if (pingFetch.diagnostics.capHit) {
          day.warnings.push(`ping_day_cap_reached:${s.id}`);
        }

        const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
          ts: p.recorded_at,
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
          speedMps: p.speed != null ? Number(p.speed) : null,
        }));

        day.rawPingCount += pings.length;

        if (pings.length === 0) continue;

        let gpsTimeline;
        try {
          gpsTimeline = buildGpsDayTimeline({
            staffId: s.id,
            organizationId: orgId,
            date,
            pings,
            targets,
          });
        } catch (e) {
          day.warnings.push(`gps_timeline_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
        }
        day.gpsDayTimelineCount += gpsTimeline.segments.length;

        // INVARIANT: gps_gap MUST NEVER appear as transport in the raw timeline.
        for (const seg of gpsTimeline.segments) {
          if (seg.kind === 'gps_gap' && seg.type === 'transport') {
            day.warnings.push(`invariant_violation:gps_gap_as_transport:${s.id}:${seg.id}`);
          }
        }

        let result;
        try {
          result = buildPresenceDayBlocks({
            staffId: s.id,
            organizationId: orgId,
            date,
            gpsTimeline,
          });
        } catch (e) {
          day.warnings.push(`presence_blocks_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
        }

        day.rawEvidenceBlocksCount += result.evidenceBlocks.length;
        day.presenceDayBlocksCount += result.blocks.length;
        day.confirmedOnSiteMinutes += result.summary.confirmedOnSiteMinutes;
        day.probableOnSiteMinutes += result.summary.probableOnSiteMinutes;
        day.signalGapMinutes += result.summary.signalGapMinutes;
        day.uncertainTransitionMinutes += result.summary.uncertainTransitionMinutes;
        day.transportMinutes += result.summary.transportMinutes;
        day.unknownMinutes += result.summary.unknownMinutes;
        day.needsReviewCount += result.summary.needsReviewCount;

        for (const b of result.blocks) {
          day.blocksByKind[b.kind] = (day.blocksByKind[b.kind] ?? 0) + 1;
        }
        for (const b of result.evidenceBlocks) {
          day.evidenceBlocksByKind[b.kind] = (day.evidenceBlocksByKind[b.kind] ?? 0) + 1;
        }

        if (samples.length < sampleLimit && result.blocks.length > 0) {
          samples.push({
            staffName: s.name ?? s.id,
            staffId: s.id,
            gpsDayTimelineCount: gpsTimeline.segments.length,
            rawEvidenceBlocksCount: result.evidenceBlocks.length,
            presenceDayBlocksCount: result.blocks.length,
            blocks: result.blocks.map((b: any) => ({
              kind: b.kind,
              startAt: b.startAt,
              endAt: b.endAt,
              durationMinutes: Math.round(b.durationMinutes * 100) / 100,
              targetLabel: b.targetLabel ?? null,
              confidence: b.confidence ?? null,
              signalGapMinutes: Math.round((b.signalGapMinutes ?? 0) * 100) / 100,
              sourceSegmentIdsCount: (b.sourceSegmentIds ?? []).length,
              hiddenRawSegmentIdsCount: (b.hiddenRawSegmentIds ?? []).length,
            })),
          });
        }

        // ── Invariant checks (run on raw evidence — aggregated blocks
        // legitimately span multiple stays for the same target). ──
        for (const b of result.evidenceBlocks) {
          if (b.kind === 'confirmed_on_site') {
            const allFromKnownStay = b.sourceSegmentIds.every((id) => {
              const seg = gpsTimeline.segments.find((g) => g.id === id);
              return seg && seg.kind === 'stay' && seg.type === 'known_site';
            });
            if (!allFromKnownStay) {
              day.warnings.push(
                `invariant_violation:confirmed_on_site_without_gps_stay:${s.id}:${b.id}`,
              );
            }
          }
          if (b.kind === 'transport') {
            const allFromTravel = b.sourceSegmentIds.every((id) => {
              const seg = gpsTimeline.segments.find((g) => g.id === id);
              return seg && seg.kind === 'travel';
            });
            if (!allFromTravel) {
              day.warnings.push(
                `invariant_violation:transport_without_gps_movement:${s.id}:${b.id}`,
              );
            }
          }
        }

        // ── Long signal gaps (>10 min) ──
        const ordered = [...result.blocks].sort(
          (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
        );
        for (let i = 0; i < ordered.length; i++) {
          const blk = ordered[i];
          if (blk.kind !== 'signal_gap' || blk.durationMinutes <= 10) continue;
          const prev = [...ordered.slice(0, i)].reverse().find(
            (x) => x.kind !== 'signal_gap' && x.kind !== 'timer_marker',
          ) ?? null;
          const next = ordered.slice(i + 1).find(
            (x) => x.kind !== 'signal_gap' && x.kind !== 'timer_marker',
          ) ?? null;

          // Distance via raw GPS anchors (last ping before, first ping after)
          let distance: number | null = null;
          const segs = gpsTimeline.segments;
          const prevSeg = prev
            ? segs.find((g) => prev.sourceSegmentIds.includes(g.id) && g.kind === 'stay')
            : null;
          const nextSeg = next
            ? segs.find((g) => next.sourceSegmentIds.includes(g.id) && g.kind === 'stay')
            : null;
          if (prevSeg && nextSeg) {
            const aLat = prevSeg.endLat ?? prevSeg.centerLat;
            const aLng = prevSeg.endLng ?? prevSeg.centerLng;
            const bLat = nextSeg.startLat ?? nextSeg.centerLat;
            const bLng = nextSeg.startLng ?? nextSeg.centerLng;
            if (aLat != null && aLng != null && bLat != null && bLng != null) {
              distance = Math.round(haversineM(aLat, aLng, bLat, bLng));
            }
          }

          let decision = 'kept_as_signal_gap';
          if (!prev || !next) decision = 'edge_of_day_unknown_anchor';
          else if (prev.targetId && next.targetId && prev.targetId === next.targetId) {
            decision = blk.durationMinutes > 30
              ? 'same_target_but_gap_over_30min_kept_as_signal_gap'
              : 'unexpected_signal_gap_inside_same_target';
          } else if (distance != null && distance >= 5000) {
            decision = 'should_be_uncertain_transition_check_engine';
          }

          allLongGaps.push({
            staffId: s.id,
            staffName: s.name ?? s.id,
            startAt: blk.startAt,
            endAt: blk.endAt,
            durationMinutes: blk.durationMinutes,
            previousBlock: prev
              ? { kind: prev.kind, targetLabel: prev.targetLabel ?? null, endAt: prev.endAt }
              : null,
            nextBlock: next
              ? { kind: next.kind, targetLabel: next.targetLabel ?? null, startAt: next.startAt }
              : null,
            distanceBetweenPreviousAndNextMeters: distance,
            decision,
          });
        }
      }
      day.sampleStaffDays = samples;

      // Top 20 longest signal gaps for the day
      day.longestSignalGaps = allLongGaps
        .sort((a, b) => b.durationMinutes - a.durationMinutes)
        .slice(0, 20);

      day.compressionRatio = day.rawEvidenceBlocksCount > 0
        ? Math.round((day.presenceDayBlocksCount / day.rawEvidenceBlocksCount) * 1000) / 1000
        : 1;
      day.unknownEvidenceBlocksCount = day.evidenceBlocksByKind['unknown_place'] ?? 0;
      day.unknownPresenceBlocksCount = day.blocksByKind['unknown_place'] ?? 0;
      day.unknownCompressionRatio = day.unknownEvidenceBlocksCount > 0
        ? Math.round((day.unknownPresenceBlocksCount / day.unknownEvidenceBlocksCount) * 1000) / 1000
        : 1;
      day.transportEvidenceBlocksCount = day.evidenceBlocksByKind['transport'] ?? 0;
      day.transportPresenceBlocksCount = day.blocksByKind['transport'] ?? 0;
      day.transportCompressionRatio = day.transportEvidenceBlocksCount > 0
        ? Math.round((day.transportPresenceBlocksCount / day.transportEvidenceBlocksCount) * 1000) / 1000
        : 1;

      perDay.push(day);
    }

    return json(200, {
      ok: true,
      organizationId: orgId,
      staffCount: staffList.length,
      perDay,
    });
  } catch (e: any) {
    console.error('[presence-day-blocks-health] fatal', e);
    return json(200, { ok: false, error: e?.message ?? String(e) });
  }
});
