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
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { buildPresenceDayBlocks } from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { buildReportCandidateBlocks } from '../_shared/time-engine/buildReportCandidateBlocks.ts';

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
  status: 'PASS' | 'FAIL';
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
      : ['2026-05-06', '2026-05-07'];
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
      const dayStart = `${date}T00:00:00Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

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
        absorbedSameTargetTransportExamples: [],
        sameTargetTransportRejectedExamples: [],
        warnings: [],
        sampleStaffReports: [],
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
      };

      let targets: WorkTarget[] = [];
      try {
        const { targets: resolved } = await resolveWorkTargets({
          organizationId: orgId,
          staffId: staffList[0]?.id ?? '00000000-0000-0000-0000-000000000000',
          date,
          supabaseAdmin: admin,
        });
        targets = resolved.map(toWorkTarget).filter((t): t is WorkTarget => !!t);
      } catch (e) {
        day.warnings.push(`target_resolve_failed: ${(e as any)?.message ?? e}`);
      }

      const samples: SampleStaffReport[] = [];

      for (const s of staffList) {
        const { data: pingRows } = await admin
          .from('staff_location_history')
          .select('lat, lng, accuracy, speed, recorded_at')
          .eq('organization_id', orgId)
          .eq('staff_id', s.id)
          .gte('recorded_at', dayStart)
          .lte('recorded_at', dayEnd)
          .order('recorded_at', { ascending: true })
          .limit(5000);

        const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
          ts: p.recorded_at,
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
          speedMps: p.speed != null ? Number(p.speed) : null,
        }));
        if (pings.length === 0) continue;

        let gpsTimeline;
        try {
          gpsTimeline = buildGpsDayTimeline({
            staffId: s.id, organizationId: orgId, date, pings, targets,
          });
        } catch (e) {
          day.warnings.push(`gps_timeline_failed:${s.id}:${(e as any)?.message ?? e}`);
          continue;
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
          const dayCutoff = `${date}T23:59:59.999Z`;
          const { data } = await admin
            .from('active_time_registrations')
            .select(
              'id, staff_id, organization_id, started_at, stopped_at, status, ' +
              'start_source, stop_source, start_target_type, start_target_id, ' +
              'start_target_label, metadata',
            )
            .eq('organization_id', orgId)
            .eq('staff_id', s.id)
            .gte('started_at', dayStart)
            .lte('started_at', dayEnd);
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

        const examples = (report.summary as any).absorbedSameTargetTransportExamples ?? [];
        for (const ex of examples) {
          if (day.absorbedSameTargetTransportExamples.length >= 25) break;
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

        const rejectedExamples =
          (report.summary as any).sameTargetTransportRejectedExamples ?? [];
        for (const ex of rejectedExamples) {
          if (day.sameTargetTransportRejectedExamples.length >= 25) break;
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
      const failed =
        v.hasZeroMinuteMainRows ||
        v.hasLegacyInputUsed ||
        v.hasLongDistanceSameTargetAbsorbed ||
        v.hasUnstableBlockIds ||
        v.createdAnyTimeReports ||
        v.createdAnyWorkdays ||
        v.createdAnyLocationTimeEntries ||
        v.createdAnyTravelTimeLogs;
      day.status = failed ? 'FAIL' : 'PASS';

      perDay.push(day);
    }

    const overallOk = perDay.every((d) => d.status === 'PASS');
    return json(200, {
      ok: overallOk,
      status: overallOk ? 'PASS' : 'FAIL',
      organizationId: orgId,
      staffCount: staffList.length,
      perDay,
    });
  } catch (e: any) {
    console.error('[report-candidate-blocks-health] fatal', e);
    return json(200, { ok: false, status: 'FAIL', error: e?.message ?? String(e) });
  }
});
