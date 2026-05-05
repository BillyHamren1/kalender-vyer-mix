/**
 * strongWorkIndicators — bedömer om en dag har "stark arbetsindikator" trots
 * att workday saknas. När någon av dessa är sann ska UI INTE bara visa
 * passivt "Saknar arbetsdag" — istället visas en repair-CTA / så kör
 * server auto-repair.
 *
 * Stark arbetsindikator (minst en):
 *   1. Assignment + GPS på planerad arbetsplats
 *   2. Assignment + GPS på annan känd arbetsplats samma dag
 *   3. Timer/LTE/time_report finns men workday saknas
 *   4. ≥2 arbetsrelevanta GPS-vistelser samma dag
 *   5. GPS-rörelse mellan två kända arbetsplatser
 *   6. Server auto-start engine confidence medium/high
 *
 * Pure function — testbar och delad mellan UI och server.
 */
import type { ActualStaffDayModel } from './actualStaffDayModel';

export type StrongWorkReasonCode =
  | 'planned_staff'
  | 'gps_on_known_work_site'
  | 'gps_on_planned_target'
  | 'travel_between_work_sites'
  | 'timer_or_time_report_exists'
  | 'server_engine_confident';

export interface StrongWorkIndicators {
  hasStrong: boolean;
  reasonCodes: StrongWorkReasonCode[];
  /** Föreslagen workday-start (tidigaste arbetsrelevanta händelse). */
  proposedStartIso: string | null;
  /** Föreslagen workday-slut (senaste arbetsrelevanta händelse, om dagen verkar slut). */
  proposedEndIso: string | null;
  /** Source-tag för audit i metadata. */
  sourceTag: 'server_background_gps_repair' | 'admin_repair_from_evidence';
}

const isWorkRelevance = (r: any) =>
  r === 'work_confirmed' || r === 'work_possible';

export function computeStrongWorkIndicators(
  model: ActualStaffDayModel,
  opts?: { sourceTag?: StrongWorkIndicators['sourceTag'] },
): StrongWorkIndicators {
  const codes = new Set<StrongWorkReasonCode>();

  // Plockar fram arbetsrelevanta vistelser via meta.workRelevance.
  const workRelevantEvents = model.actualEvents.filter(ev => {
    const m = (ev.meta ?? {}) as any;
    return isWorkRelevance(m.workRelevance);
  });
  const workRelevantVisits = model.actualVisits.filter(v => {
    // Vi har inte workRelevance direkt på visit; använd knownSiteId som proxy
    // (kända arbetsplatser räknas alltid som arbetsrelevanta).
    return !!v.knownSiteId;
  });

  // 3) Timer/LTE/time_report finns men workday saknas
  const rs = model.reportState;
  const hasReportingEvidence =
    rs.timeReports.length > 0 ||
    rs.locationEntries.length > 0 ||
    rs.travelLogs.some(t => t.approved);
  if (hasReportingEvidence) codes.add('timer_or_time_report_exists');

  // 6) Server auto-start engine confidence medium/high
  for (const ev of model.actualEvents) {
    const m = (ev.meta ?? {}) as any;
    const conf = m.confidence ?? m.lteMetadata?.stop_metadata?.confidence;
    const autoStarted = m.autoStarted === true || m.auto_started === true;
    if (autoStarted && (conf === 'medium' || conf === 'high')) {
      codes.add('server_engine_confident');
      break;
    }
  }

  // 1+2) Assignment + GPS på arbetsplats
  const planned = (model as any).plannedAssignments as
    | Array<{ id: string; plannedStart: string }>
    | undefined;
  const hasPlanned = Array.isArray(planned) && planned.length > 0;
  if (hasPlanned) {
    codes.add('planned_staff');
    if (workRelevantVisits.length > 0) {
      codes.add('gps_on_known_work_site');
      // Försiktig heuristik: om någon visit-label matchar något i planned label
      const plannedLabels = (planned ?? []).map(p =>
        ((p as any).label ?? '').toLowerCase(),
      );
      const onPlannedTarget = workRelevantVisits.some(v =>
        plannedLabels.some(l => l && v.label.toLowerCase().includes(l)),
      );
      if (onPlannedTarget) codes.add('gps_on_planned_target');
    }
  } else if (workRelevantVisits.length > 0) {
    codes.add('gps_on_known_work_site');
  }

  // 4) ≥2 arbetsrelevanta GPS-vistelser
  if (workRelevantVisits.length >= 2) codes.add('gps_on_known_work_site');

  // 5) GPS-rörelse mellan två kända arbetsplatser
  const travels = model.actualEvents.filter(ev => ev.kind === 'gps_travel');
  for (const t of travels) {
    const m = (t.meta ?? {}) as any;
    if (m.fromKnownSiteId && m.toKnownSiteId) {
      codes.add('travel_between_work_sites');
      break;
    }
  }
  // Fallback: om vi har två arbetsrelevanta visits + någon travel mellan dem
  if (!codes.has('travel_between_work_sites') && workRelevantVisits.length >= 2 && travels.length > 0) {
    codes.add('travel_between_work_sites');
  }

  const hasStrong = codes.size > 0;

  // Proposed start = tidigaste arbetsrelevant tidpunkt
  let proposedStartIso: string | null = null;
  let proposedEndIso: string | null = null;
  if (hasStrong) {
    const candidates: string[] = [];
    if (workRelevantVisits.length) {
      candidates.push(...workRelevantVisits.map(v => v.start));
    }
    for (const e of workRelevantEvents) candidates.push(e.at);
    for (const r of rs.timeReports) candidates.push(r.start_iso);
    for (const e of rs.locationEntries) candidates.push(e.entered_at);
    if (candidates.length) {
      proposedStartIso = candidates.sort()[0];
    }

    const ends: string[] = [];
    if (workRelevantVisits.length) ends.push(...workRelevantVisits.map(v => v.end));
    for (const r of rs.timeReports) if (r.end_iso) ends.push(r.end_iso);
    for (const e of rs.locationEntries) if (e.exited_at) ends.push(e.exited_at);
    if (ends.length) proposedEndIso = ends.sort().slice(-1)[0];
  }

  return {
    hasStrong,
    reasonCodes: Array.from(codes),
    proposedStartIso,
    proposedEndIso,
    sourceTag: opts?.sourceTag ?? 'admin_repair_from_evidence',
  };
}
