// READ-ONLY: Layer 1 (Day Evidence) report runner.
// Calls buildDayEvidence for a list of {staffId, date} cases and returns a
// compact diagnostic snapshot per case. Mutates nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildDayEvidence } from '../_shared/time-engine/buildDayEvidence.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';

const ORG = 'f5e5cade-f08b-4833-a105-56461f15b191';

interface Case { id: string; label: string; staffId: string; date: string; }

const DEFAULT_CASES: Case[] = [
  { id: '1_westmans_split', label: 'Westmans Uthyrning split-day (Armands 2026-05-09)',
    staffId: 'staff_1775736725128_wfzzhpwus', date: '2026-05-09' },
  { id: '2_pavels_creative', label: 'Pavels Creative Meetings (2026-05-14)',
    staffId: 'staff_1778052393424_hng6qbuhc', date: '2026-05-14' },
  { id: '3_logosol_lp', label: 'LOGOSOL/large project (Billy 2026-05-13)',
    staffId: '365f4d55-b4a8-4248-8e3a-8d5b40af1e3b', date: '2026-05-13' },
  { id: '4_fa_warehouse', label: 'FA Warehouse-dag (Raivis 2026-05-09)',
    staffId: 'staff_1775736348370_e5mua0yum', date: '2026-05-09' },
  { id: '5_no_gps', label: 'Person utan GPS (Andris Sergejevs 2026-05-15)',
    staffId: 'c75ca300-4c4a-4d24-8bc6-91c400afd784', date: '2026-05-15' },
  { id: '6_private_night', label: 'Hem/private/natt (Pavels 2026-05-15, no zones)',
    staffId: 'staff_1778052393424_hng6qbuhc', date: '2026-05-15' },
  { id: '7_long_gap', label: 'Långt signalgap (Pavels 2026-05-13 endast morgon)',
    staffId: 'staff_1778052393424_hng6qbuhc', date: '2026-05-13' },
  { id: '8_gps_spike', label: 'GPS-spike (Elvijs 2026-05-12 high count)',
    staffId: 'staff_1775736788338_wtp4p3rcn', date: '2026-05-12' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const cases: Case[] = Array.isArray(body?.cases) && body.cases.length > 0
      ? body.cases : DEFAULT_CASES;
    const orgId = body?.organizationId ?? ORG;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const results = [];
    for (const c of cases) {
      try {
        const { startUtc, endUtc } = getStockholmDayWindowUtc(c.date);
        const ev = await buildDayEvidence({
          supabaseAdmin: admin, organizationId: orgId,
          staffId: c.staffId, date: c.date,
          dayStartUtc: startUtc, dayEndUtc: endUtc,
        });
        const d = ev.diagnostics ?? {};
        const gps = d.gps ?? {};
        const ae = d.assignmentEvidenceDiagnostics ?? {};
        const kt = d.knownTargetsDiagnostics ?? {};
        const dq = ev.knownTargets?.dataQuality ?? {};

        const itemsByType = new Map<string, number>();
        for (const it of ev.knownTargets?.items ?? []) {
          itemsByType.set(it.targetType, (itemsByType.get(it.targetType) ?? 0) + 1);
        }

        const aItems = ev.assignments?.items ?? [];
        const aSummary = {
          directBookingAssignmentCount: aItems.filter((i: any) => i.source === 'booking_staff_assignment').length,
          staffAssignmentCount: aItems.filter((i: any) => i.source === 'staff_assignment').length,
          calendarEventCount: ae.calendarEventCount ?? (ev as any)?.assignments?.calendarEvents?.length ?? 0,
          largeProjectAssignmentCount: aItems.filter((i: any) => !!i.largeProjectId).length,
          teamAssignmentCount: aItems.filter((i: any) => !!i.teamId).length,
          examples: aItems.slice(0, 3).map((i: any) => ({
            source: i.source, bookingId: i.bookingId, lpId: i.largeProjectId,
            teamId: i.teamId, phase: i.plannedPhase,
          })),
        };

        // Conclusion heuristic
        const reasons: string[] = [];
        const gpsOk = (gps.locationLogicPingCount ?? 0) > 10 && (gps.coverageRatio ?? 0) > 0.05;
        const assignmentOk = aItems.length > 0;
        const targetsOk = (ev.knownTargets?.totalCount ?? 0) > 0
          && (ev.knownTargets?.withCoordinatesCount ?? 0) > 0;
        const dqIssues: string[] = [];
        if ((dq.targetsMissingCoordinates?.length ?? 0) > 0) dqIssues.push('targetsMissingCoordinates');
        if ((dq.targetsMissingRadius?.length ?? 0) > 0) dqIssues.push('targetsMissingRadius');
        if ((dq.largeProjectsMissingGeo?.length ?? 0) > 0) dqIssues.push('largeProjectsMissingGeo');
        if ((dq.calendarEventsWithoutTarget?.length ?? 0) > 0) dqIssues.push('calendarEventsWithoutTarget');
        if ((dq.assignmentsWithoutMatchingTarget?.length ?? 0) > 0) dqIssues.push('assignmentsWithoutMatchingTarget');

        if (!gpsOk) reasons.push('gps_evidence_weak_or_missing');
        if (!assignmentOk) reasons.push('assignment_context_missing');
        if (!targetsOk) reasons.push('no_usable_targets');
        if ((kt.largeProjectRules?.largeProjectsMissingGeoCount ?? 0) > 0) reasons.push('large_project_geo_missing');
        if ((kt.childBookingsSuppressedCount ?? 0) > 0 || (kt.childProjectsSuppressedCount ?? 0) > 0)
          reasons.push('child_object_suppression_active');
        if ((gps.ignoredOutlierPingCount ?? 0) > 0 || (gps.longGapCount ?? 0) > 0)
          reasons.push('outlier_or_gap_for_layer2');
        if (dqIssues.length > 0) reasons.push('data_quality_issue');

        let verdict = 'lager_1_ser_korrekt_ut';
        if (!gpsOk && !assignmentOk) verdict = 'gps_och_assignment_saknas';
        else if (!gpsOk) verdict = 'gps_evidence_saknas';
        else if (!targetsOk && !assignmentOk) verdict = 'inga_targets_eller_assignments';
        else if (dqIssues.length > 0) verdict = 'data_quality_måste_fixas';
        else if ((gps.ignoredOutlierPingCount ?? 0) > 5 || (gps.longGapCount ?? 0) > 2)
          verdict = 'outlier_gap_behöver_lager_2';

        results.push({
          case: c.id, label: c.label, staffId: c.staffId, date: c.date,
          A_gps: {
            rawPingCount: gps.rawPingCount ?? 0,
            fetchedPingCount: gps.fetchedPingCount ?? 0,
            normalizedPingCount: gps.normalizedPingCount ?? 0,
            locationLogicPingCount: gps.locationLogicPingCount ?? 0,
            hardRejectedPingCount: gps.hardRejectedPingCount ?? 0,
            ignoredOutlierPingCount: gps.ignoredOutlierPingCount ?? 0,
            retainedLowAccuracyCount: gps.retainedLowAccuracyCount ?? 0,
            medianAccuracyMeters: gps.medianAccuracyMeters,
            p90AccuracyMeters: gps.p90AccuracyMeters,
            longGapCount: gps.longGapCount ?? 0,
            maxGapMinutes: gps.maxGapMinutes ?? 0,
            coverageRatio: gps.coverageRatio ?? 0,
          },
          B_assignments: aSummary,
          C_known_targets: {
            warehouseCount: itemsByType.get('warehouse') ?? 0,
            organizationLocationCount: itemsByType.get('organization_location') ?? 0,
            largeProjectCount: kt.largeProjectCount ?? 0,
            projectCount: itemsByType.get('project') ?? 0,
            bookingCount: itemsByType.get('booking') ?? 0,
            privateZoneCount: kt.privateZoneCount ?? 0,
            childBookingsSuppressedCount: kt.childBookingsSuppressedCount ?? 0,
            childProjectsSuppressedCount: kt.childProjectsSuppressedCount ?? 0,
            largeProjectsMissingGeoCount: kt.largeProjectsMissingGeoCount ?? 0,
          },
          D_data_quality: {
            targetsMissingCoordinates: (dq.targetsMissingCoordinates ?? []).length,
            targetsMissingRadius: (dq.targetsMissingRadius ?? []).length,
            largeProjectsMissingGeo: (dq.largeProjectsMissingGeo ?? []).length,
            calendarEventsWithoutTarget: (dq.calendarEventsWithoutTarget ?? []).length,
            assignmentsWithoutMatchingTarget: (dq.assignmentsWithoutMatchingTarget ?? []).length,
            sampleLargeProjectsMissingGeo: (dq.largeProjectsMissingGeo ?? []).slice(0, 3),
            sampleCalendarEventsWithoutTarget: (dq.calendarEventsWithoutTarget ?? []).slice(0, 3),
          },
          E_verdict: verdict,
          E_reasons: reasons,
          gpsOk, assignmentOk, targetsOk, dqIssues,
          warnings: ev.diagnostics?.warnings ?? [],
        });
      } catch (e: any) {
        results.push({ case: c.id, error: e?.message ?? String(e) });
      }
    }

    // Build markdown table
    const rows = results.map((r: any) => {
      if (r.error) return `| ${r.case} | ERR | - | - | - | NEJ | ${r.error} |`;
      return `| ${r.case} | ${r.gpsOk ? 'JA' : 'NEJ'} | ${r.assignmentOk ? 'JA' : 'NEJ'} | ${r.targetsOk ? 'JA' : 'NEJ'} | ${r.dqIssues.join(',') || '-'} | ${r.E_verdict.startsWith('lager_1') ? 'JA' : 'DELVIS'} | ${r.E_reasons.join('; ') || 'ok'} |`;
    });
    const table = ['| Case | GPS OK | Assignment OK | Targets OK | DQ issue | Ready for L2? | Reason |',
      '|---|---|---|---|---|---|---|', ...rows].join('\n');

    return new Response(JSON.stringify({ ok: true, table, results }, null, 2),
      { headers: { ...cors(), 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...cors(), 'content-type': 'application/json' } });
  }
});

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  };
}
