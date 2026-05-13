// @ts-nocheck
/**
 * report-candidate-blocks-health
 * ──────────────────────────────
 * Read-only health check for buildReportCandidateBlocks.
 *
 * Pipeline per staff/day:
 *   pings                        → buildGpsDayTimeline
 *                                → buildPresenceDayBlocks
 *   active_time_registrations  ─┐
 *                                ├→ buildReportCandidateBlocks
 *   presenceDayBlocks ──────────┘
 *
 * SOURCES OF TRUTH (engine inputs):
 *   - staff_location_history       (GPS pings)
 *   - active_time_registrations    (active timer context — NEW canonical source)
 *
 * NOT used as engine inputs (legacy, do NOT re-introduce here):
 *   - location_time_entries        (legacy active timer table)
 *   - travel_time_logs             (legacy travel entries)
 *   - time_reports                 (output, not truth)
 *
 * NEVER writes anything. NEVER creates time_reports.
 *
 * POST { dates: ["2026-05-06","2026-05-07"], organizationId?, sampleStaffReportCount? }
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
import { loadGeoAnchors } from '../_shared/time-engine/loadGeoAnchors.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { buildPresenceDayBlocks } from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { buildReportCandidateBlocks } from '../_shared/time-engine/buildReportCandidateBlocks.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';

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

interface SampleReportBlock {
  kind: string;
  title: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  confidence: string;
  reviewState: string;
  reviewReasons: string[];
  signalGapMinutes: number;
  sourcePresenceBlockIdsCount: number;
  hiddenSignalGapIdsCount: number;
  warningLabel: string | null;
}
interface SampleStaffReport {
  staffName: string;
  staffId: string;
  presenceDayBlocksCount: number;
  reportCandidateBlocksCount: number;
  reportBlocks: SampleReportBlock[];
}
interface DayHealth {
  date: string;
  staffCount: number;
  presenceDayBlocksCount: number;
  reportCandidateBlocksCount: number;
  compressionRatioFromPresenceToReport: number;
  reportBlocksByKind: Record<string, number>;
  workMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
  signalGapMinutesHiddenInsideWorkBlocks: number;
  reportRowsWithSignalWarnings: number;
  needsReviewCount: number;
  // Micro-suppression metrics (rules 1, 4, 5)
  reportBlocksBeforeMicroSuppression: number;
  reportBlocksAfterMicroSuppression: number;
  microSuppressionRatio: number;
  suppressedMicroTransportCount: number;
  suppressedMicroTransportMinutes: number;
  suppressedTinyWorkBlocksCount: number;
  suppressedTinyWorkMinutes: number;
  transportRowsBeforeSameTargetAbsorption: number;
  transportRowsAfterSameTargetAbsorption: number;
  sameTargetTransportAbsorbedCount: number;
  sameTargetTransportAbsorbedMinutes: number;
  sameTargetTransportRejectedByDistanceCount: number;
  sameTargetTransportRejectedByDistanceMinutes: number;
  crossTargetTransportKeptCount: number;
  shortCrossTargetTransportReviewCount: number;
  shortUnknownTransportReviewCount: number;
  shortUnknownTransportHiddenCount: number;
  // Pre-work exclusion (POST-PASS 3)
  preWorkExcludedMinutes: number;
  preWorkExcludedBlocksCount: number;
  preWorkExcludedReasons: Record<string, number>;
  preWorkExcludedExamples: Array<{
    staffName: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    originalKind: string;
    originalLabel: string;
    reason: string;
  }>;
  absorbedSameTargetTransportExamples: Array<{
    staffName: string;
    staffId: string;
    targetLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    distanceMeters: number;
    absorbedIntoWorkBlock: { startAt: string; endAt: string } | null;
    reviewReasons: string[];
  }>;
  sameTargetTransportRejectedExamples: Array<{
    staffName: string;
    staffId: string;
    targetLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    distanceMeters: number | null;
    decision: 'kept_as_transport' | 'needs_review';
    reviewReasons: string[];
  }>;
  // ── Same-target transport regression buckets (per-day, max 25 each) ──
  /** A) work A → transport ≤25 min, distance ≤750 m → folded into work-A. */
  sameTargetTransportRegression_absorbed: Array<{
    staffName: string;
    staffId: string;
    targetLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    distanceMeters: number;
    absorbedIntoWorkBlock: { startAt: string; endAt: string } | null;
  }>;
  /** B) work A → transport, distance > 750 m → kept, needs_review,
   *     reviewReason `same_target_roundtrip_distance_too_large`. */
  sameTargetTransportRegression_rejectedByDistance: Array<{
    staffName: string;
    staffId: string;
    targetLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    distanceMeters: number;
    decision: 'needs_review';
    reviewReasons: string[];
  }>;
  /** C) work A → transport with no distance → kept as transport,
   *     reviewReason `same_target_transport_missing_distance`. */
  sameTargetTransportRegression_rejectedMissingDistance: Array<{
    staffName: string;
    staffId: string;
    targetLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    decision: 'kept_as_transport';
    reviewReasons: string[];
  }>;
  /** D) work A → transport → work B (different targets) → transport stays. */
  sameTargetTransportRegression_keptCrossTarget: Array<{
    staffName: string;
    staffId: string;
    fromLabel: string | null;
    toLabel: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    distanceMeters: number | null;
  }>;
  warnings: string[];
  sampleStaffReports: SampleStaffReport[];
  // Engine input provenance / validation surface
  activeTimeRegistrationsCount: number;
  openActiveTimeRegistrationsCount: number;
  activeTimeRegistrationsUsedAsInput: true;
  legacyLocationTimeEntriesCount: number;
  legacyLocationTimeEntriesUsedAsInput: false;
  validation: {
    hasZeroMinuteMainRows: boolean;
    hasSignalGapAsNormalReportRow: boolean;
    hasLongDistanceSameTargetAbsorbed: boolean;
    hasLegacyInputUsed: boolean;
    hasUnstableBlockIds: boolean;
    createdAnyTimeReports: boolean;
    createdAnyWorkdays: boolean;
    createdAnyLocationTimeEntries: boolean;
    createdAnyTravelTimeLogs: boolean;
  };
  status: 'PASS' | 'WARNING' | 'FAIL';
  geofenceDiagnostics?: {
    transportSegmentsInsidePrimaryTargetCount: number;
    transportMinutesInsidePrimaryTarget: number;
    transportInsidePrimaryTargetExamples: Array<{
      staffName: string;
      staffId: string;
      segmentStart: string;
      segmentEnd: string;
      durationMinutes: number;
      travelInsideTargetLabel: string | null;
      pingsInsideSameTargetRatio: number | null;
      computedKmh: number | null;
      distanceMeters: number;
      nearestTargetDistanceMeters: number | null;
      nearestTargetRadiusMeters: number | null;
      movementReason: string | null;
    }>;
    travelInsideTargetCandidateCount: number;
    travelInsideTargetCandidateMinutes: number;
    targetsAvailableToGpsTimeline: number;
    knownSiteSegments: number;
    transportSegments: number;
    unknownPlaceSegments: number;
    movementInsideGeofenceReclassifiedCount: number;
    movementInsideGeofenceReclassifiedMinutes: number;
    movementInsideGeofenceExamples: Array<{
      staffName: string;
      staffId: string;
      segmentStart: string;
      segmentEnd: string;
      durationMinutes: number;
      targetLabel: string | null;
      pingsInsideSameTargetRatio: number | null;
      computedKmh: number | null;
      movementReason: string | null;
      nearestTargetDistanceMeters: number | null;
      nearestTargetRadiusMeters: number | null;
      clearExitDetected: boolean;
    }>;
    // Buckets för transport-inside-primary (efter post-pass)
    transportInsidePrimaryTotalMinutes: number;
    transportInsidePrimaryTotalCount: number;
    reclassifiableTransportInsidePrimaryCount: number;
    reclassifiableTransportInsidePrimaryMinutes: number;
    keptBecauseClearExitCount: number;
    keptBecauseClearExitMinutes: number;
    keptBecauseRatioBelowThresholdCount: number;
    keptBecauseRatioBelowThresholdMinutes: number;
    keptBecauseSecondaryOrUnsafeTargetCount: number;
    keptBecauseSecondaryOrUnsafeTargetMinutes: number;
    keptBecauseDurationTooLongCount: number;
    keptBecauseDurationTooLongMinutes: number;
    remainingGeofenceWarningCount: number;
    remainingGeofenceWarningMinutes: number;
  };
}

/** Same-target transport with measured distance above this is "long distance"
 *  and must NOT be absorbed (rule: round-trips outside the noise window stay
 *  as transport). Mirrors buildReportCandidateBlocks default
 *  sameTargetTransportAbsorbMaxDistanceMeters. */
const LONG_DISTANCE_ABSORB_THRESHOLD_M = 750;
/** Stable, deterministic ids produced by createReportCandidateBlockId start
 *  with this prefix. Anything else is treated as unstable / legacy. */
const STABLE_BLOCK_ID_PREFIX = 'rc_';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim() : '';
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

    const sampleLimit: number = Math.max(0, Math.min(10, Number(body?.sampleStaffReportCount ?? 2)));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: staff } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('organization_id', orgId);
    const staffList = staff ?? [];

    const perDay: DayHealth[] = [];

    for (const date of dates) {
      const { startUtc: dayStart, endUtc: dayEnd } = getStockholmDayWindowUtc(date);

      const day: DayHealth = {
        date,
        staffCount: staffList.length,
        presenceDayBlocksCount: 0,
        reportCandidateBlocksCount: 0,
        compressionRatioFromPresenceToReport: 1,
        reportBlocksByKind: {},
        workMinutes: 0,
        transportMinutes: 0,
        unknownMinutes: 0,
        needsReviewMinutes: 0,
        signalGapMinutesHiddenInsideWorkBlocks: 0,
        reportRowsWithSignalWarnings: 0,
        needsReviewCount: 0,
        reportBlocksBeforeMicroSuppression: 0,
        reportBlocksAfterMicroSuppression: 0,
        microSuppressionRatio: 1,
        suppressedMicroTransportCount: 0,
        suppressedMicroTransportMinutes: 0,
        suppressedTinyWorkBlocksCount: 0,
        suppressedTinyWorkMinutes: 0,
        transportRowsBeforeSameTargetAbsorption: 0,
        transportRowsAfterSameTargetAbsorption: 0,
        sameTargetTransportAbsorbedCount: 0,
        sameTargetTransportAbsorbedMinutes: 0,
        sameTargetTransportRejectedByDistanceCount: 0,
        sameTargetTransportRejectedByDistanceMinutes: 0,
        crossTargetTransportKeptCount: 0,
        shortCrossTargetTransportReviewCount: 0,
        shortUnknownTransportReviewCount: 0,
        shortUnknownTransportHiddenCount: 0,
        preWorkExcludedMinutes: 0,
        preWorkExcludedBlocksCount: 0,
        preWorkExcludedReasons: {} as Record<string, number>,
        preWorkExcludedExamples: [] as Array<any>,
        absorbedSameTargetTransportExamples: [],
        sameTargetTransportRejectedExamples: [],
        warnings: [],
        sampleStaffReports: [],
        sameTargetTransportRegression_absorbed: [],
        sameTargetTransportRegression_rejectedByDistance: [],
        sameTargetTransportRegression_rejectedMissingDistance: [],
        sameTargetTransportRegression_keptCrossTarget: [],
        activeTimeRegistrationsCount: 0,
        openActiveTimeRegistrationsCount: 0,
        activeTimeRegistrationsUsedAsInput: true,
        legacyLocationTimeEntriesCount: 0,
        legacyLocationTimeEntriesUsedAsInput: false,
        validation: {
          hasZeroMinuteMainRows: false,
          hasSignalGapAsNormalReportRow: false,
          hasLongDistanceSameTargetAbsorbed: false,
          hasLegacyInputUsed: false,
          hasUnstableBlockIds: false,
          createdAnyTimeReports: false,
          createdAnyWorkdays: false,
          createdAnyLocationTimeEntries: false,
          createdAnyTravelTimeLogs: false,
        },
        status: 'PASS',
        geofenceDiagnostics: {
          transportSegmentsInsidePrimaryTargetCount: 0,
          transportMinutesInsidePrimaryTarget: 0,
          transportInsidePrimaryTargetExamples: [],
          travelInsideTargetCandidateCount: 0,
          travelInsideTargetCandidateMinutes: 0,
          targetsAvailableToGpsTimeline: 0,
          knownSiteSegments: 0,
          transportSegments: 0,
          unknownPlaceSegments: 0,
          movementInsideGeofenceReclassifiedCount: 0,
          movementInsideGeofenceReclassifiedMinutes: 0,
          movementInsideGeofenceExamples: [],
          transportInsidePrimaryTotalMinutes: 0,
          transportInsidePrimaryTotalCount: 0,
          reclassifiableTransportInsidePrimaryCount: 0,
          reclassifiableTransportInsidePrimaryMinutes: 0,
          keptBecauseClearExitCount: 0,
          keptBecauseClearExitMinutes: 0,
          keptBecauseRatioBelowThresholdCount: 0,
          keptBecauseRatioBelowThresholdMinutes: 0,
          keptBecauseSecondaryOrUnsafeTargetCount: 0,
          keptBecauseSecondaryOrUnsafeTargetMinutes: 0,
          keptBecauseDurationTooLongCount: 0,
          keptBecauseDurationTooLongMinutes: 0,
          remainingGeofenceWarningCount: 0,
          remainingGeofenceWarningMinutes: 0,
        },
      };

      let targets: WorkTarget[] = [];
      const dayTargetResolution = {
        primaryTargetsCount: 0,
        secondaryTargetsCount: 0,
        unsafeAutoMatchedTargetsCount: 0,
        dateRelevantBookingsAsPrimaryCount: 0,
        activeProjectsAsPrimaryCount: 0,
        unassignedBookingsMatchedAsWorkCount: 0,
        unassignedProjectsMatchedAsWorkCount: 0,
        secondaryCandidatesNearGps: 0,
        warnings: [] as string[],
      };
      try {
        const { targets: resolved, targetResolution } = await resolveWorkTargets({
          organizationId: orgId,
          staffId: staffList[0]?.id ?? '00000000-0000-0000-0000-000000000000',
          date,
          supabaseAdmin: admin,
        });
        targets = resolved.map(toWorkTarget).filter((t): t is WorkTarget => !!t);
        if (targetResolution) {
          dayTargetResolution.primaryTargetsCount = targetResolution.primaryTargetsCount;
          dayTargetResolution.secondaryTargetsCount = targetResolution.secondaryTargetsCount;
          dayTargetResolution.unsafeAutoMatchedTargetsCount = targetResolution.unsafeAutoMatchedTargetsCount;
          dayTargetResolution.dateRelevantBookingsAsPrimaryCount = targetResolution.dateRelevantBookingsAsPrimaryCount;
          dayTargetResolution.activeProjectsAsPrimaryCount = targetResolution.activeProjectsAsPrimaryCount;
          dayTargetResolution.unassignedBookingsMatchedAsWorkCount = targetResolution.unassignedBookingsMatchedAsWorkCount;
          dayTargetResolution.unassignedProjectsMatchedAsWorkCount = targetResolution.unassignedProjectsMatchedAsWorkCount;
          dayTargetResolution.warnings = targetResolution.warnings ?? [];
        }
      } catch (e) {
        day.warnings.push(`target_resolve_failed: ${(e as any)?.message ?? e}`);
      }
      (day as any).targetResolution = dayTargetResolution;

      const samples: SampleStaffReport[] = [];

      // Sticky primary target diagnostics — aggregated per day/org
      const stickyAgg = {
        stickyReclassifiedCount: 0,
        stickyReclassifiedMinutes: 0,
        strongExitCount: 0,
        strongExitMinutes: 0,
        exitRejectedBecauseUnder1kmCount: 0,
        exitRejectedBecauseUnder1kmMinutes: 0,
        arrivedAtOtherPrimaryTargetCount: 0,
        longClearExitCount: 0,
        remainingTransportNearStickyTargetCount: 0,
        remainingTransportNearStickyTargetMinutes: 0,
        examples: [] as Array<{
          staffId: string; staffName: string;
          segmentStart: string; segmentEnd: string; durationMinutes: number;
          stickyTargetLabel: string | null;
          distanceFromStickyCenterMeters: number | null;
          distanceOutsideStickyGeofenceMeters: number | null;
          decision: string; longClearExit: boolean; reasonNotReclassified: string | null;
        }>,
      };
      (day as any).stickyTargetDiagnostics = stickyAgg;

      // Geo-anchor diagnostics — aggregated per day/org
      const geoAnchorAgg = {
        hardAnchorCount: 0,
        hardEntryCount: 0,
        hardExitCount: 0,
        entriesAppliedToSticky: 0,
        entriesSeededStickyEarly: 0,
        entriesIgnoredNoMatchingTarget: 0,
        exitsObservedWithoutStrongExit: 0,
        transportSegmentsAfterGeoEntryWithoutStrongExitMinutes: 0,
        weakAnchorCount: 0,
        weakReasons: {} as Record<string, number>,
        examples: [] as Array<{
          staffId: string; staffName: string;
          type: 'entry' | 'exit'; atLocalStockholm: string;
          targetLabel: string | null; source: string;
        }>,
      };
      (day as any).geoAnchorDiagnostics = geoAnchorAgg;

      // Stationary inside-geofence override diagnostics — aggregated per day/org
      const stationaryOverrideAgg = {
        rescuedStayCount: 0,
        rescuedStayMinutes: 0,
        pingsInsidePrimaryCount: 0,
        pingsInsidePrimaryRatioSum: 0,
        pingsInsidePrimaryRatioStaffCount: 0,
        remainingTransportInsidePrimaryGeofenceCount: 0,
        remainingTransportInsidePrimaryGeofenceMinutes: 0,
        examples: [] as Array<{
          staffId: string; staffName: string;
          targetLabel: string;
          startLocalStockholm: string;
          endLocalStockholm: string;
          durationMinutes: number;
          pingCount: number;
          medianAccuracyMeters: number | null;
        }>,
      };
      (day as any).stationaryGeofenceOverride = stationaryOverrideAgg;

      for (const s of staffList) {
        const pingFetch = await fetchAllStaffLocationPings({
          supabaseAdmin: admin,
          organizationId: orgId,
          staffId: s.id,
          startUtc: dayStart,
          endUtc: dayEnd,
        });
        const pingRows = pingFetch.rows;
        if (pingFetch.diagnostics.capHit) {
          (day as any).warnings = ((day as any).warnings ?? []);
          (day as any).warnings.push(`ping_day_cap_reached:${s.id}`);
        }

        const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
          ts: p.recorded_at,
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
          speedMps: p.speed != null ? Number(p.speed) : null,
        }));
        if (pings.length === 0) continue;

        // Load hard geo anchors for this staff/day (read-only).
        let geoAnchorsForStaff: any[] = [];
        try {
          const ga = await loadGeoAnchors({
            supabaseAdmin: admin,
            organizationId: orgId,
            staffId: s.id,
            startUtc: dayStart,
            endUtc: dayEnd,
            targets,
          });
          geoAnchorsForStaff = ga.anchors;
          // Aggregate weak counts (engine ignores them; surface them for ops).
          for (const a of ga.anchors) {
            if (a.strength !== 'hard') {
              geoAnchorAgg.weakAnchorCount++;
              if (a.weakReason) {
                geoAnchorAgg.weakReasons[a.weakReason] =
                  (geoAnchorAgg.weakReasons[a.weakReason] ?? 0) + 1;
              }
            }
          }
        } catch (e) {
          day.warnings.push(`geo_anchors_failed:${s.id}:${(e as any)?.message ?? e}`);
        }

        let gpsTimeline;
        try {
          gpsTimeline = buildGpsDayTimeline({
            staffId: s.id, organizationId: orgId, date, pings, targets,
            geoAnchors: geoAnchorsForStaff,
          });
        } catch (e) {
          day.warnings.push(`gps_timeline_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
        }

        // ── Geo anchor diagnostics: aggregate across staff for the day ──
        try {
          const gad = (gpsTimeline as any).geoAnchorDiagnostics;
          if (gad) {
            geoAnchorAgg.hardAnchorCount += Number(gad.hardAnchorCount ?? 0);
            geoAnchorAgg.hardEntryCount += Number(gad.hardEntryCount ?? 0);
            geoAnchorAgg.hardExitCount += Number(gad.hardExitCount ?? 0);
            geoAnchorAgg.entriesAppliedToSticky += Number(gad.entriesAppliedToSticky ?? 0);
            geoAnchorAgg.entriesSeededStickyEarly += Number(gad.entriesSeededStickyEarly ?? 0);
            geoAnchorAgg.entriesIgnoredNoMatchingTarget += Number(gad.entriesIgnoredNoMatchingTarget ?? 0);
            geoAnchorAgg.exitsObservedWithoutStrongExit += Number(gad.exitsObservedWithoutStrongExit ?? 0);
            geoAnchorAgg.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes +=
              Number(gad.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes ?? 0);
            for (const ex of gad.examples ?? []) {
              if (geoAnchorAgg.examples.length >= 50) break;
              geoAnchorAgg.examples.push({
                staffId: s.id,
                staffName: s.name ?? s.id,
                type: ex.type,
                atLocalStockholm: ex.atLocalStockholm,
                targetLabel: ex.targetLabel ?? null,
                source: ex.source,
              });
            }
          }
        } catch (e) {
          day.warnings.push(`geo_anchor_diag_failed:${s.id}:${(e as any)?.message ?? e}`);
        }

        // ── Stationary inside-geofence override: aggregate across staff ──
        try {
          const sgo = (gpsTimeline as any).stationaryGeofenceOverride;
          if (sgo) {
            stationaryOverrideAgg.rescuedStayCount += Number(sgo.rescuedStayCount ?? 0);
            stationaryOverrideAgg.rescuedStayMinutes += Number(sgo.rescuedStayMinutes ?? 0);
            stationaryOverrideAgg.pingsInsidePrimaryCount += Number(sgo.pingsInsidePrimaryCount ?? 0);
            if (sgo.pingsInsidePrimaryRatio != null) {
              stationaryOverrideAgg.pingsInsidePrimaryRatioSum += Number(sgo.pingsInsidePrimaryRatio);
              stationaryOverrideAgg.pingsInsidePrimaryRatioStaffCount += 1;
            }
            for (const ex of (sgo.examples ?? []) as any[]) {
              if (stationaryOverrideAgg.examples.length >= 50) break;
              stationaryOverrideAgg.examples.push({
                staffId: s.id,
                staffName: s.name ?? s.id,
                targetLabel: String(ex.targetLabel ?? ''),
                startLocalStockholm: String(ex.startLocalStockholm ?? ''),
                endLocalStockholm: String(ex.endLocalStockholm ?? ''),
                durationMinutes: Number(ex.durationMinutes ?? 0),
                pingCount: Number(ex.pingCount ?? 0),
                medianAccuracyMeters:
                  ex.medianAccuracyMeters != null ? Number(ex.medianAccuracyMeters) : null,
              });
            }
          }
          const remCount = Number(
            (gpsTimeline as any).remainingTransportInsidePrimaryGeofenceCount ?? 0,
          );
          const remMin = Number(
            (gpsTimeline as any).remainingTransportInsidePrimaryGeofenceMinutes ?? 0,
          );
          stationaryOverrideAgg.remainingTransportInsidePrimaryGeofenceCount += remCount;
          stationaryOverrideAgg.remainingTransportInsidePrimaryGeofenceMinutes += remMin;
        } catch (e) {
          day.warnings.push(`stationary_override_diag_failed:${s.id}:${(e as any)?.message ?? e}`);
        }

        // ── Geofence diagnostics: aggregate across staff for the day ──
        try {
          const gd = day.geofenceDiagnostics!;
          const cls = (gpsTimeline as any).classificationDiagnostics ?? {};
          const tms = (gpsTimeline as any).targetMatchSummary ?? {};
          gd.travelInsideTargetCandidateCount += Number(cls.travelSegmentsInsideTargetCandidateCount ?? 0);
          gd.travelInsideTargetCandidateMinutes += Number(cls.travelSegmentsInsideTargetCandidateMinutes ?? 0);
          gd.targetsAvailableToGpsTimeline = Math.max(
            gd.targetsAvailableToGpsTimeline,
            Number(cls.targetsAvailableToGpsTimeline ?? targets.length),
          );
          gd.knownSiteSegments += Number(tms.knownSiteSegments ?? 0);
          gd.transportSegments += Number(tms.transportSegments ?? 0);
          gd.unknownPlaceSegments += Number(tms.unknownPlaceSegments ?? 0);

          // Reclassified (movement_inside_geofence) — promoted from travel to known_site
          gd.movementInsideGeofenceReclassifiedCount +=
            Number(cls.movementInsideGeofenceReclassifiedCount ?? 0);
          gd.movementInsideGeofenceReclassifiedMinutes +=
            Number(cls.movementInsideGeofenceReclassifiedMinutes ?? 0);

          // Per-bucket breakdown av kvarvarande transport-inside-primary
          gd.transportInsidePrimaryTotalCount += Number(cls.transportInsidePrimaryTotalCount ?? 0);
          gd.transportInsidePrimaryTotalMinutes += Number(cls.transportInsidePrimaryTotalMinutes ?? 0);
          gd.reclassifiableTransportInsidePrimaryCount += Number(cls.reclassifiableTransportInsidePrimaryCount ?? 0);
          gd.reclassifiableTransportInsidePrimaryMinutes += Number(cls.reclassifiableTransportInsidePrimaryMinutes ?? 0);
          gd.keptBecauseClearExitCount += Number(cls.keptBecauseClearExitCount ?? 0);
          gd.keptBecauseClearExitMinutes += Number(cls.keptBecauseClearExitMinutes ?? 0);
          gd.keptBecauseRatioBelowThresholdCount += Number(cls.keptBecauseRatioBelowThresholdCount ?? 0);
          gd.keptBecauseRatioBelowThresholdMinutes += Number(cls.keptBecauseRatioBelowThresholdMinutes ?? 0);
          gd.keptBecauseSecondaryOrUnsafeTargetCount += Number(cls.keptBecauseSecondaryOrUnsafeTargetCount ?? 0);
          gd.keptBecauseSecondaryOrUnsafeTargetMinutes += Number(cls.keptBecauseSecondaryOrUnsafeTargetMinutes ?? 0);
          gd.keptBecauseDurationTooLongCount += Number(cls.keptBecauseDurationTooLongCount ?? 0);
          gd.keptBecauseDurationTooLongMinutes += Number(cls.keptBecauseDurationTooLongMinutes ?? 0);
          for (const ex of (cls.movementInsideGeofenceExamples ?? []) as any[]) {
            if (gd.movementInsideGeofenceExamples.length >= 25) break;
            gd.movementInsideGeofenceExamples.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              segmentStart: ex.segmentStart,
              segmentEnd: ex.segmentEnd,
              durationMinutes: Number(ex.durationMinutes ?? 0),
              targetLabel: ex.targetLabel ?? null,
              pingsInsideSameTargetRatio:
                ex.pingsInsideSameTargetRatio != null ? Number(ex.pingsInsideSameTargetRatio) : null,
              computedKmh: ex.computedKmh != null ? Number(ex.computedKmh) : null,
              movementReason: ex.movementReason ?? null,
              nearestTargetDistanceMeters:
                ex.nearestTargetDistanceMeters != null ? Number(ex.nearestTargetDistanceMeters) : null,
              nearestTargetRadiusMeters:
                ex.nearestTargetRadiusMeters != null ? Number(ex.nearestTargetRadiusMeters) : null,
              clearExitDetected: !!ex.clearExitDetected,
            });
          }

          for (const seg of (gpsTimeline as any).segments ?? []) {
            if (seg.kind !== 'travel' && seg.type !== 'transport') continue;
            const td = seg.targetDiagnostics ?? {};
            if (!td.travelInsideTargetCandidate) continue;
            gd.transportSegmentsInsidePrimaryTargetCount += 1;
            gd.transportMinutesInsidePrimaryTarget += Number(seg.durationMin ?? 0);
            if (gd.transportInsidePrimaryTargetExamples.length < 25) {
              const m = seg.movementDecision ?? {};
              gd.transportInsidePrimaryTargetExamples.push({
                staffName: s.name ?? s.id,
                staffId: s.id,
                segmentStart: seg.startTs,
                segmentEnd: seg.endTs,
                durationMinutes: Math.round(Number(seg.durationMin ?? 0) * 100) / 100,
                travelInsideTargetLabel: td.travelInsideTargetLabel ?? null,
                pingsInsideSameTargetRatio:
                  td.pingsInsideSameTargetRatio != null ? Number(td.pingsInsideSameTargetRatio) : null,
                computedKmh: m.computedKmh != null ? Number(m.computedKmh) : null,
                distanceMeters: Math.round(Number(seg.distanceMeters ?? 0)),
                nearestTargetDistanceMeters:
                  td.nearestTargetDistanceMeters != null ? Number(td.nearestTargetDistanceMeters) : null,
                nearestTargetRadiusMeters:
                  td.nearestTargetRadiusMeters != null ? Number(td.nearestTargetRadiusMeters) : null,
                movementReason: m.reason ?? null,
              });
            }
          }
        } catch (e) {
          day.warnings.push(`geofence_diag_failed:${s.id}:${(e as any)?.message ?? e}`);
        }

        // Sticky primary target diagnostics aggregation
        try {
          const std = (gpsTimeline as any).classificationDiagnostics?.stickyTargetDiagnostics;
          if (std) {
            stickyAgg.stickyReclassifiedCount += Number(std.stickyReclassifiedCount ?? 0);
            stickyAgg.stickyReclassifiedMinutes += Number(std.stickyReclassifiedMinutes ?? 0);
            stickyAgg.strongExitCount += Number(std.strongExitCount ?? 0);
            stickyAgg.strongExitMinutes += Number(std.strongExitMinutes ?? 0);
            stickyAgg.exitRejectedBecauseUnder1kmCount += Number(std.exitRejectedBecauseUnder1kmCount ?? 0);
            stickyAgg.exitRejectedBecauseUnder1kmMinutes += Number(std.exitRejectedBecauseUnder1kmMinutes ?? 0);
            stickyAgg.arrivedAtOtherPrimaryTargetCount += Number(std.arrivedAtOtherPrimaryTargetCount ?? 0);
            stickyAgg.longClearExitCount += Number(std.longClearExitCount ?? 0);
            stickyAgg.remainingTransportNearStickyTargetCount += Number(std.remainingTransportNearStickyTargetCount ?? 0);
            stickyAgg.remainingTransportNearStickyTargetMinutes += Number(std.remainingTransportNearStickyTargetMinutes ?? 0);
            for (const ex of (std.examples ?? []) as any[]) {
              if (stickyAgg.examples.length >= 50) break;
              stickyAgg.examples.push({
                staffId: s.id,
                staffName: s.name ?? s.id,
                segmentStart: ex.segmentStart,
                segmentEnd: ex.segmentEnd,
                durationMinutes: Number(ex.durationMinutes ?? 0),
                stickyTargetLabel: ex.stickyTargetLabel ?? null,
                distanceFromStickyCenterMeters:
                  ex.distanceFromStickyCenterMeters != null ? Number(ex.distanceFromStickyCenterMeters) : null,
                distanceOutsideStickyGeofenceMeters:
                  ex.distanceOutsideStickyGeofenceMeters != null ? Number(ex.distanceOutsideStickyGeofenceMeters) : null,
                decision: String(ex.decision ?? ''),
                longClearExit: !!ex.longClearExit,
                reasonNotReclassified: ex.reasonNotReclassified ?? null,
              });
            }
          }
        } catch (e) {
          day.warnings.push(`sticky_diag_failed:${s.id}:${(e as any)?.message ?? e}`);
        }

        let presence;
        try {
          presence = buildPresenceDayBlocks({
            staffId: s.id, organizationId: orgId, date, gpsTimeline,
          });
        } catch (e) {
          day.warnings.push(`presence_blocks_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
        }

        // Active timer context for the engine — NEW SOURCE OF TRUTH.
        // Engine input MUST come from `active_time_registrations`. Legacy
        // `location_time_entries` / `travel_time_logs` / `time_reports` are
        // intentionally NOT read here.
        let activeRegs: any[] = [];
        const activeOpenDiagnostics: Array<{
          id: string;
          staffId: string;
          startedAt: string;
          status: string | null;
          startSource: string | null;
          targetType: string | null;
          targetId: string | null;
          targetLabel: string | null;
          assumedStoppedAt: string;
        }> = [];
        try {
          const nowIso = new Date().toISOString();
          const dayCutoff = dayEnd;
          const { data } = await admin
            .from('active_time_registrations')
            .select(
              'id, staff_id, organization_id, started_at, stopped_at, status, ' +
              'start_source, stop_source, start_target_type, start_target_id, ' +
              'start_target_label, metadata',
            )
            .eq('organization_id', orgId)
            .eq('staff_id', s.id)
            // Overlap query: registration intersects [dayStart, dayEnd] when
            // started_at <= dayEnd AND (stopped_at IS NULL OR stopped_at >= dayStart).
            // Previous version used started_at >= dayStart which dropped any
            // registration that started yesterday and continued into today.
            .lte('started_at', dayEnd)
            .or(`stopped_at.is.null,stopped_at.gte.${dayStart}`);
          activeRegs = (data ?? []).map((r: any) => {
            const isActive = (r.status ?? '').toLowerCase() === 'active';
            const stoppedAt: string | null =
              r.stopped_at ?? (isActive ? (nowIso < dayCutoff ? nowIso : dayCutoff) : null);
            if (isActive || !r.stopped_at) {
              activeOpenDiagnostics.push({
                id: r.id,
                staffId: r.staff_id,
                startedAt: r.started_at,
                status: r.status ?? null,
                startSource: r.start_source ?? null,
                targetType: r.start_target_type ?? null,
                targetId: r.start_target_id ?? null,
                targetLabel: r.start_target_label ?? null,
                assumedStoppedAt: stoppedAt ?? dayCutoff,
              });
            }
            return {
              id: r.id,
              staffId: r.staff_id,
              organizationId: r.organization_id,
              startedAt: r.started_at,
              stoppedAt,
              status: r.status ?? null,
              startSource: r.start_source ?? null,
              stopSource: r.stop_source ?? null,
              targetType: r.start_target_type ?? null,
              targetId: r.start_target_id ?? null,
              targetLabel: r.start_target_label ?? null,
              metadata: r.metadata ?? null,
            };
          });
          day.activeTimeRegistrationsCount += activeRegs.length;
          day.openActiveTimeRegistrationsCount += activeOpenDiagnostics.length;
          if (activeOpenDiagnostics.length) {
            (day as any).activeOpenRegistrations =
              ((day as any).activeOpenRegistrations ?? []).concat(activeOpenDiagnostics);
          }
        } catch (e) {
          day.warnings.push(
            `active_time_registrations_read_failed:${s.id}:${(e as any)?.message ?? e}`,
          );
        }

        // Legacy LTE / travel — read-only diagnostics ONLY. NEVER fed to engine.
        try {
          const { count: lteCount } = await admin
            .from('location_time_entries')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('staff_id', s.id)
            .gte('started_at', dayStart)
            .lte('started_at', dayEnd);
          day.legacyLocationTimeEntriesCount += lteCount ?? 0;
        } catch {
          // table missing / RLS — ignore, legacy is non-authoritative
        }

        let report;
        try {
          report = buildReportCandidateBlocks({
            staffId: s.id,
            organizationId: orgId,
            date,
            presenceDayBlocks: presence.blocks,
            activeTimeRegistrations: activeRegs,
          });
        } catch (e) {
          day.warnings.push(`report_blocks_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
        }

        // Determinism check: same input → same block ids in same order.
        // If ids drift between runs we cannot use them as stable contracts
        // for AI/action layers, so this is a hard FAIL.
        try {
          const second = buildReportCandidateBlocks({
            staffId: s.id,
            organizationId: orgId,
            date,
            presenceDayBlocks: presence.blocks,
            activeTimeRegistrations: activeRegs,
          });
          const a = report.blocks.map((b: any) => b.id);
          const b2 = second.blocks.map((b: any) => b.id);
          let unstable = a.length !== b2.length;
          if (!unstable) {
            for (let k = 0; k < a.length; k++) {
              if (a[k] !== b2[k]) { unstable = true; break; }
            }
          }
          if (unstable) {
            day.validation.hasUnstableBlockIds = true;
            day.warnings.push(`invariant:unstable_block_id_between_runs:${s.id}`);
          }
        } catch (e) {
          day.warnings.push(
            `report_blocks_stability_check_failed:${s.id}:${(e as any)?.message ?? e}`,
          );
        }

        day.presenceDayBlocksCount += presence.blocks.length;
        day.reportCandidateBlocksCount += report.blocks.length;
        day.workMinutes += report.summary.workMinutes;
        day.transportMinutes += report.summary.transportMinutes;
        day.unknownMinutes += report.summary.unknownMinutes;
        day.needsReviewMinutes += report.summary.needsReviewMinutes;
        day.signalGapMinutesHiddenInsideWorkBlocks +=
          report.summary.signalGapMinutesHiddenInsideWorkBlocks;
        day.reportRowsWithSignalWarnings += report.summary.reportRowsWithSignalWarnings;
        day.needsReviewCount += report.summary.needsReviewBlocksCount;
        day.reportBlocksBeforeMicroSuppression +=
          (report.summary as any).reportBlocksBeforeMicroSuppression ?? 0;
        day.reportBlocksAfterMicroSuppression +=
          (report.summary as any).reportBlocksAfterMicroSuppression ?? report.blocks.length;
        day.suppressedMicroTransportCount +=
          (report.summary as any).suppressedMicroTransportCount ?? 0;
        day.suppressedMicroTransportMinutes +=
          (report.summary as any).suppressedMicroTransportMinutes ?? 0;
        day.suppressedTinyWorkBlocksCount +=
          (report.summary as any).suppressedTinyWorkBlocksCount ?? 0;
        day.suppressedTinyWorkMinutes +=
          (report.summary as any).suppressedTinyWorkMinutes ?? 0;
        day.transportRowsBeforeSameTargetAbsorption +=
          (report.summary as any).transportRowsBeforeSameTargetAbsorption ?? 0;
        day.transportRowsAfterSameTargetAbsorption +=
          (report.summary as any).transportRowsAfterSameTargetAbsorption ?? 0;
        day.sameTargetTransportAbsorbedCount +=
          (report.summary as any).sameTargetTransportAbsorbedCount ?? 0;
        day.sameTargetTransportAbsorbedMinutes +=
          (report.summary as any).sameTargetTransportAbsorbedMinutes ?? 0;
        day.sameTargetTransportRejectedByDistanceCount +=
          (report.summary as any).sameTargetTransportRejectedByDistanceCount ?? 0;
        day.sameTargetTransportRejectedByDistanceMinutes +=
          (report.summary as any).sameTargetTransportRejectedByDistanceMinutes ?? 0;
        day.crossTargetTransportKeptCount +=
          (report.summary as any).crossTargetTransportKeptCount ?? 0;
        day.shortCrossTargetTransportReviewCount +=
          (report.summary as any).shortCrossTargetTransportReviewCount ?? 0;
        day.shortUnknownTransportReviewCount +=
          (report.summary as any).shortUnknownTransportReviewCount ?? 0;
        day.shortUnknownTransportHiddenCount +=
          (report.summary as any).shortUnknownTransportHiddenCount ?? 0;

        // ── Pre-work exclusion: aggregate diagnostics + invariants ──
        const preWorkDiag = (report as any).preWorkExclusionDiagnostics ?? null;
        if (preWorkDiag) {
          day.preWorkExcludedMinutes += Number(preWorkDiag.excludedPreWorkMinutes ?? 0);
          day.preWorkExcludedBlocksCount += Number(preWorkDiag.excludedPreWorkBlocksCount ?? 0);
          for (const [reason, n] of Object.entries(preWorkDiag.excludedReasons ?? {})) {
            day.preWorkExcludedReasons[reason] =
              (day.preWorkExcludedReasons[reason] ?? 0) + Number(n ?? 0);
          }
          for (const ex of (preWorkDiag.examples ?? [])) {
            if (day.preWorkExcludedExamples.length < 25) {
              day.preWorkExcludedExamples.push({ staffName: s.name ?? s.id, ...ex });
            }
          }
        }
        // Invariant: there must be no unknown_place / non-target row before the
        // first secure work target after PASS 3.
        const firstPrimaryIdx = report.blocks.findIndex(
          (b: any) => b.kind === 'work' && !!b.targetId,
        );
        if (firstPrimaryIdx > 0) {
          for (let k = 0; k < firstPrimaryIdx; k++) {
            const b = report.blocks[k] as any;
            if (b.kind === 'unknown' || (b.kind === 'work' && !b.targetId)) {
              day.warnings.push(
                `pre_work_unknown_in_report:${s.id}:${b.id}:${b.startAt}`,
              );
              break;
            }
          }
        }

        const examples = (report.summary as any).absorbedSameTargetTransportExamples ?? [];
        for (const ex of examples) {
          if (day.absorbedSameTargetTransportExamples.length < 25) {
            day.absorbedSameTargetTransportExamples.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              targetLabel: ex.targetLabel ?? null,
              startAt: ex.startAt,
              endAt: ex.endAt,
              durationMinutes: ex.durationMinutes,
              distanceMeters: ex.distanceMeters,
              absorbedIntoWorkBlock: ex.absorbedIntoWorkBlock ?? null,
              reviewReasons: ex.reviewReasons ?? [],
            });
          }
          // Regression bucket A: absorbed (same-target, short distance)
          if (day.sameTargetTransportRegression_absorbed.length < 25) {
            day.sameTargetTransportRegression_absorbed.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              targetLabel: ex.targetLabel ?? null,
              startAt: ex.startAt,
              endAt: ex.endAt,
              durationMinutes: ex.durationMinutes,
              distanceMeters: ex.distanceMeters,
              absorbedIntoWorkBlock: ex.absorbedIntoWorkBlock ?? null,
            });
          }
        }

        const rejectedExamples =
          (report.summary as any).sameTargetTransportRejectedExamples ?? [];
        for (const ex of rejectedExamples) {
          if (day.sameTargetTransportRejectedExamples.length < 25) {
            day.sameTargetTransportRejectedExamples.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              targetLabel: ex.targetLabel ?? null,
              startAt: ex.startAt,
              endAt: ex.endAt,
              durationMinutes: ex.durationMinutes,
              distanceMeters: ex.distanceMeters ?? null,
              decision: ex.decision,
              reviewReasons: ex.reviewReasons ?? [],
            });
          }
          const reasons: string[] = ex.reviewReasons ?? [];
          // Regression bucket B: rejected by distance (>750 m)
          if (
            ex.decision === 'needs_review' &&
            reasons.includes('same_target_roundtrip_distance_too_large') &&
            day.sameTargetTransportRegression_rejectedByDistance.length < 25
          ) {
            day.sameTargetTransportRegression_rejectedByDistance.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              targetLabel: ex.targetLabel ?? null,
              startAt: ex.startAt,
              endAt: ex.endAt,
              durationMinutes: ex.durationMinutes,
              distanceMeters: ex.distanceMeters,
              decision: 'needs_review',
              reviewReasons: reasons,
            });
          }
          // Regression bucket C: rejected because distance is missing
          if (
            ex.decision === 'kept_as_transport' &&
            reasons.includes('same_target_transport_missing_distance') &&
            day.sameTargetTransportRegression_rejectedMissingDistance.length < 25
          ) {
            day.sameTargetTransportRegression_rejectedMissingDistance.push({
              staffName: s.name ?? s.id,
              staffId: s.id,
              targetLabel: ex.targetLabel ?? null,
              startAt: ex.startAt,
              endAt: ex.endAt,
              durationMinutes: ex.durationMinutes,
              decision: 'kept_as_transport',
              reviewReasons: reasons,
            });
          }
        }

        // Regression bucket D: cross-target transport kept (work A → work B)
        const crossKept = (report.summary as any).keptCrossTargetTransportExamples ?? [];
        for (const ex of crossKept) {
          if (day.sameTargetTransportRegression_keptCrossTarget.length >= 25) break;
          day.sameTargetTransportRegression_keptCrossTarget.push({
            staffName: s.name ?? s.id,
            staffId: s.id,
            fromLabel: ex.fromLabel ?? null,
            toLabel: ex.toLabel ?? null,
            startAt: ex.startAt,
            endAt: ex.endAt,
            durationMinutes: ex.durationMinutes,
            distanceMeters: ex.distanceMeters ?? null,
          });
        }

        for (const b of report.blocks) {
          day.reportBlocksByKind[b.kind] = (day.reportBlocksByKind[b.kind] ?? 0) + 1;
          if (b.durationMinutes <= 0) {
            day.validation.hasZeroMinuteMainRows = true;
            day.warnings.push(`invariant:zero_minute_report_block:${s.id}:${b.id}`);
          }
          if ((b.kind as any) === 'signal_gap') {
            day.validation.hasSignalGapAsNormalReportRow = true;
            day.warnings.push(`invariant:signal_gap_as_report_row:${s.id}:${b.id}`);
          }
          if (typeof b.id !== 'string' || !b.id.startsWith(STABLE_BLOCK_ID_PREFIX)) {
            day.validation.hasUnstableBlockIds = true;
            day.warnings.push(`invariant:unstable_block_id:${s.id}:${b.id}`);
          }
        }

        if (samples.length < sampleLimit && report.blocks.length > 0) {
          samples.push({
            staffName: s.name ?? s.id,
            staffId: s.id,
            presenceDayBlocksCount: presence.blocks.length,
            reportCandidateBlocksCount: report.blocks.length,
            reportBlocks: report.blocks.map((b: any) => ({
              kind: b.kind,
              title: b.title,
              startAt: b.startAt,
              endAt: b.endAt,
              durationMinutes: Math.round(b.durationMinutes * 100) / 100,
              confidence: b.confidence,
              reviewState: b.reviewState,
              reviewReasons: b.reviewReasons ?? [],
              signalGapMinutes: Math.round((b.signalGapMinutes ?? 0) * 100) / 100,
              sourcePresenceBlockIdsCount: (b.sourcePresenceBlockIds ?? []).length,
              hiddenSignalGapIdsCount: (b.hiddenSignalGapIds ?? []).length,
              warningLabel: b.warningLabel ?? null,
            })),
          });
        }
      }

      day.sampleStaffReports = samples;
      day.compressionRatioFromPresenceToReport = day.presenceDayBlocksCount > 0
        ? Math.round((day.reportCandidateBlocksCount / day.presenceDayBlocksCount) * 1000) / 1000
        : 1;
      day.microSuppressionRatio = day.reportBlocksBeforeMicroSuppression > 0
        ? Math.round((day.reportBlocksAfterMicroSuppression / day.reportBlocksBeforeMicroSuppression) * 1000) / 1000
        : 1;

      // ── Validation finalization ─────────────────────────────────────────
      // Long-distance same-target absorption is a hard correctness violation.
      day.validation.hasLongDistanceSameTargetAbsorbed =
        day.absorbedSameTargetTransportExamples.some(
          (ex) => (ex.distanceMeters ?? 0) > LONG_DISTANCE_ABSORB_THRESHOLD_M,
        );
      // The engine never reads legacy LTE/travel/time_reports — by construction.
      day.validation.hasLegacyInputUsed = false;
      // The engine and this health check NEVER write. By construction these
      // are always false; surfaced explicitly so dashboards can prove it.
      day.validation.createdAnyTimeReports = false;
      day.validation.createdAnyWorkdays = false;
      day.validation.createdAnyLocationTimeEntries = false;
      day.validation.createdAnyTravelTimeLogs = false;

      const v = day.validation;
      const tr = (day as any).targetResolution ?? {};
      const failed =
        v.hasZeroMinuteMainRows ||
        v.hasSignalGapAsNormalReportRow ||
        v.hasLegacyInputUsed ||
        v.hasLongDistanceSameTargetAbsorbed ||
        v.hasUnstableBlockIds ||
        v.createdAnyTimeReports ||
        v.createdAnyWorkdays ||
        v.createdAnyLocationTimeEntries ||
        v.createdAnyTravelTimeLogs ||
        (tr.unsafeAutoMatchedTargetsCount ?? 0) > 0 ||
        (tr.dateRelevantBookingsAsPrimaryCount ?? 0) > 0 ||
        (tr.activeProjectsAsPrimaryCount ?? 0) > 0 ||
        (tr.unassignedBookingsMatchedAsWorkCount ?? 0) > 0 ||
        (tr.unassignedProjectsMatchedAsWorkCount ?? 0) > 0;
      // Round geofence diagnostics minutes
      if (day.geofenceDiagnostics) {
        const gd = day.geofenceDiagnostics;
        const r = (n: number) => Math.round(n * 100) / 100;
        gd.transportMinutesInsidePrimaryTarget = r(gd.transportMinutesInsidePrimaryTarget);
        gd.travelInsideTargetCandidateMinutes = r(gd.travelInsideTargetCandidateMinutes);
        gd.movementInsideGeofenceReclassifiedMinutes = r(gd.movementInsideGeofenceReclassifiedMinutes);
        gd.transportInsidePrimaryTotalMinutes = r(gd.transportInsidePrimaryTotalMinutes);
        gd.reclassifiableTransportInsidePrimaryMinutes = r(gd.reclassifiableTransportInsidePrimaryMinutes);
        gd.keptBecauseClearExitMinutes = r(gd.keptBecauseClearExitMinutes);
        gd.keptBecauseRatioBelowThresholdMinutes = r(gd.keptBecauseRatioBelowThresholdMinutes);
        gd.keptBecauseSecondaryOrUnsafeTargetMinutes = r(gd.keptBecauseSecondaryOrUnsafeTargetMinutes);
        gd.keptBecauseDurationTooLongMinutes = r(gd.keptBecauseDurationTooLongMinutes);
        // remainingGeofenceWarning summerar ENDAST verkliga motorfel
        gd.remainingGeofenceWarningCount = gd.reclassifiableTransportInsidePrimaryCount;
        gd.remainingGeofenceWarningMinutes = gd.reclassifiableTransportInsidePrimaryMinutes;
      }

      // WARNING (not FAIL): bara segment där motorn borde reklassat men inte
      // gjorde det räknas. Transport behållen pga clearExit / låg ratio /
      // för långt segment / sekundär target visas som diagnostik men triggar
      // INTE WARNING — det är inget motorfel.
      const reclassifiableMin =
        day.geofenceDiagnostics?.reclassifiableTransportInsidePrimaryMinutes ?? 0;
      const geofenceWarning = reclassifiableMin > 30;
      if (geofenceWarning) {
        day.warnings.push(
          `geofence:reclassifiable_transport_inside_primary_minutes=${reclassifiableMin} ` +
            `(${day.geofenceDiagnostics?.reclassifiableTransportInsidePrimaryCount ?? 0} segment) — ` +
            `GPS klassas som transport inom geofence trots att alla villkor för reklassificering är uppfyllda.`,
        );
      }

      // Round + WARNING for sticky primary target
      const std: any = (day as any).stickyTargetDiagnostics;
      let stickyWarning = false;
      if (std) {
        const r = (n: number) => Math.round(n * 100) / 100;
        std.stickyReclassifiedMinutes = r(std.stickyReclassifiedMinutes);
        std.strongExitMinutes = r(std.strongExitMinutes);
        std.exitRejectedBecauseUnder1kmMinutes = r(std.exitRejectedBecauseUnder1kmMinutes);
        std.remainingTransportNearStickyTargetMinutes = r(std.remainingTransportNearStickyTargetMinutes);
        if (std.remainingTransportNearStickyTargetMinutes > 30) {
          stickyWarning = true;
          day.warnings.push(
            `transport_near_sticky_primary_without_strong_exit:` +
              `${std.remainingTransportNearStickyTargetMinutes} min ` +
              `(${std.remainingTransportNearStickyTargetCount} segment) — ` +
              `Transport kvar inom 1 km från sticky primary target utan strong exit.`,
          );
        }
      }

      // Round + WARNING for geo-anchor sticky engine
      const gaa: any = (day as any).geoAnchorDiagnostics;
      let geoAnchorWarning = false;
      if (gaa) {
        gaa.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes =
          Math.round(gaa.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes * 100) / 100;
        if (gaa.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes > 0) {
          geoAnchorWarning = true;
          day.warnings.push(
            `transport_after_geo_entry_without_strong_exit:` +
              `${gaa.transportSegmentsAfterGeoEntryWithoutStrongExitMinutes} min — ` +
              `Transport efter geo entry på primary target utan stark exit (geo exit räknas inte ensamt).`,
          );
        }
      }

      // Round + WARNING for stationary inside-geofence override (only the
      // remaining-transport bucket is a warning; rescued stays are INFO).
      const sga: any = (day as any).stationaryGeofenceOverride;
      let stationaryOverrideWarning = false;
      if (sga) {
        sga.rescuedStayMinutes = Math.round(sga.rescuedStayMinutes * 100) / 100;
        sga.remainingTransportInsidePrimaryGeofenceMinutes =
          Math.round(sga.remainingTransportInsidePrimaryGeofenceMinutes * 100) / 100;
        sga.pingsInsidePrimaryRatio = sga.pingsInsidePrimaryRatioStaffCount > 0
          ? Math.round(
              (sga.pingsInsidePrimaryRatioSum / sga.pingsInsidePrimaryRatioStaffCount) * 1000,
            ) / 1000
          : 0;
        delete sga.pingsInsidePrimaryRatioSum;
        delete sga.pingsInsidePrimaryRatioStaffCount;
        if (sga.remainingTransportInsidePrimaryGeofenceMinutes > 0) {
          stationaryOverrideWarning = true;
          day.warnings.push(
            `transport_inside_primary_geofence_not_rescued:` +
              `${sga.remainingTransportInsidePrimaryGeofenceMinutes} min ` +
              `(${sga.remainingTransportInsidePrimaryGeofenceCount} segment) — ` +
              `Transport inom primary geofence överlevde override (motorfel eller suppressad eligibility).`,
          );
        }
      }

      day.status = failed
        ? 'FAIL'
        : (geofenceWarning || stickyWarning || geoAnchorWarning || stationaryOverrideWarning)
          ? 'WARNING'
          : 'PASS';

      perDay.push(day);
    }

    const anyFail = perDay.some((d) => d.status === 'FAIL');
    const anyWarning = perDay.some((d) => d.status === 'WARNING');
    const overallStatus: 'PASS' | 'WARNING' | 'FAIL' =
      anyFail ? 'FAIL' : anyWarning ? 'WARNING' : 'PASS';
    return json(200, {
      ok: overallStatus !== 'FAIL',
      status: overallStatus,
      organizationId: orgId,
      staffCount: staffList.length,
      perDay,
    });
  } catch (e: any) {
    console.error('[report-candidate-blocks-health] fatal', e);
    return json(200, { ok: false, status: 'FAIL', error: e?.message ?? String(e) });
  }
});
