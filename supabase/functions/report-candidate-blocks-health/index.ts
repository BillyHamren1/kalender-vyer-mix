// @ts-nocheck
/**
 * report-candidate-blocks-health
 * ──────────────────────────────
 * Read-only health check for buildReportCandidateBlocks.
 *
 * Pipeline per staff/day:
 *   pings → buildGpsDayTimeline → buildPresenceDayBlocks
 *         → buildReportCandidateBlocks
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
  crossTargetTransportKeptCount: number;
  shortCrossTargetTransportReviewCount: number;
  shortUnknownTransportReviewCount: number;
  shortUnknownTransportHiddenCount: number;
  warnings: string[];
  sampleStaffReports: SampleStaffReport[];
}

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
        crossTargetTransportKeptCount: 0,
        shortCrossTargetTransportReviewCount: 0,
        shortUnknownTransportReviewCount: 0,
        shortUnknownTransportHiddenCount: 0,
        warnings: [],
        sampleStaffReports: [],
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

        let activeRegs: any[] = [];
        try {
          const { data } = await admin
            .from('location_time_entries')
            .select('id, started_at, ended_at, source, target_type, target_id')
            .eq('organization_id', orgId)
            .eq('staff_id', s.id)
            .gte('started_at', dayStart)
            .lte('started_at', dayEnd);
          activeRegs = (data ?? []).map((r: any) => ({
            id: r.id, startedAt: r.started_at, endedAt: r.ended_at,
            source: r.source, targetType: r.target_type, targetId: r.target_id,
          }));
        } catch { /* table optional */ }

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

        for (const b of report.blocks) {
          day.reportBlocksByKind[b.kind] = (day.reportBlocksByKind[b.kind] ?? 0) + 1;
          if (b.durationMinutes <= 0) {
            day.warnings.push(`invariant:zero_minute_report_block:${s.id}:${b.id}`);
          }
          if ((b.kind as any) === 'signal_gap') {
            day.warnings.push(`invariant:signal_gap_as_report_row:${s.id}:${b.id}`);
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

      perDay.push(day);
    }

    return json(200, {
      ok: true,
      organizationId: orgId,
      staffCount: staffList.length,
      perDay,
    });
  } catch (e: any) {
    console.error('[report-candidate-blocks-health] fatal', e);
    return json(200, { ok: false, error: e?.message ?? String(e) });
  }
});
