/**
 * Beslutsmatris för arbetsstart (Case A–E).
 *
 * Pure function — ingen DB, ingen React. Speglas server-side av
 * day-timeline-engine och process-location-auto-start. Reglerna är
 * dokumenterade i [Decision matrix v1].
 *
 * Case A:  Stable GPS på arbetsplats + assignment finns                   → auto-start, confidence high
 * Case B:  Stable GPS på känd arbetsplats utan assignment                 → auto-start, "oplanerad aktivitet"
 * Case C:  Assignment från 08:00 men ingen signal förrän 13:10            → start från GPS, planned_time_without_signal-förslag
 * Case D:  Endast nattlig/privat/okänd GPS → första arbetsplats            → dölj nattlig GPS, dagens start = första arbetsankaret
 * Case E:  Två arbetsplatser med GPS-förflyttning emellan                  → work_travel mellan dem
 */
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';
import type {
  ActualPlannedAssignmentInput,
  PrivateZone,
} from './actualStaffDayModel';

export type WorkStartCase =
  | 'A_assignment_with_gps'
  | 'B_known_site_no_assignment'
  | 'C_assignment_without_signal'
  | 'D_only_private_then_first_work'
  | 'E_multiple_work_sites'
  | 'none';

export interface WorkStartDecision {
  caseKind: WorkStartCase;
  confidence: 'low' | 'medium' | 'high';
  effectiveWorkStartIso: string | null;
  /** True om Case C: kräver user/admin-bekräftelse för spannet planned→firstSignal. */
  requiresReview: boolean;
  /** Det första arbetsankaret (visit) som dagen baseras på, om något. */
  firstWorkVisitKey: string | null;
  /** Sant om vi har dolt nattlig/privat lead-in. */
  hidNightLeadIn: boolean;
  /** Sant om matrisen identifierat travel mellan två arbetsplatser. */
  hasInterWorksiteTravel: boolean;
  reason: string;
}

export interface DecisionInput {
  visits: PlaceVisit[];
  travels: TravelGap[];
  plannedAssignments: ActualPlannedAssignmentInput[];
  privateZones: PrivateZone[];
  /** Map placeKey → klassificering från actualStaffDayModel. */
  visitRelevance: Map<string, 'work_confirmed' | 'work_possible' | 'unknown_requires_lookup' | 'private_or_background' | 'raw_debug_only'>;
  /** Earliest planned start (ISO) — null om inga assignments. */
  earliestPlannedStartIso: string | null;
  /** First confirmed signal (ISO) = min(firstPing, firstTimer, workdayStart). */
  firstSignalIso: string | null;
  /** Tröskel för "betydligt senare än planerat" i minuter. Default 30. */
  lateAfterPlannedMinutes?: number;
}

const isMainJournal = (r: string | undefined): boolean =>
  r === 'work_confirmed' || r === 'work_possible';

export function classifyWorkStart(input: DecisionInput): WorkStartDecision {
  const lateAfterPlannedMinutes = input.lateAfterPlannedMinutes ?? 30;

  // Sort visits chronologically.
  const sorted = [...input.visits].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // Identify the first work-relevant visit (first work anchor).
  const firstWorkVisit = sorted.find(v => {
    const r = input.visitRelevance.get(v.placeKey);
    return isMainJournal(r);
  }) ?? null;

  // Did we have any pre-work visits that were night/private/unknown?
  const hidNightLeadIn = !!firstWorkVisit
    && sorted.some(v => v !== firstWorkVisit
      && new Date(v.start).getTime() < new Date(firstWorkVisit.start).getTime()
      && !isMainJournal(input.visitRelevance.get(v.placeKey)));

  // Travel between two work-relevant visits?
  const hasInterWorksiteTravel = input.travels.some(t => {
    const fr = input.visitRelevance.get(t.from.placeKey);
    const to = input.visitRelevance.get(t.to.placeKey);
    return isMainJournal(fr) && isMainJournal(to);
  });

  const hasAssignment = input.plannedAssignments.length > 0;
  const plannedMs = input.earliestPlannedStartIso ? new Date(input.earliestPlannedStartIso).getTime() : null;
  const firstSignalMs = input.firstSignalIso ? new Date(input.firstSignalIso).getTime() : null;

  // Case C: assignment exists, but first signal is significantly later than planned.
  // Even if firstSignalMs is null we still flag review.
  if (hasAssignment && plannedMs != null) {
    const lateGapMin = firstSignalMs == null
      ? Number.POSITIVE_INFINITY
      : Math.round((firstSignalMs - plannedMs) / 60_000);
    if (lateGapMin >= lateAfterPlannedMinutes) {
      return {
        caseKind: 'C_assignment_without_signal',
        confidence: 'medium',
        effectiveWorkStartIso: firstWorkVisit?.start ?? input.firstSignalIso,
        requiresReview: true,
        firstWorkVisitKey: firstWorkVisit?.placeKey ?? null,
        hidNightLeadIn,
        hasInterWorksiteTravel,
        reason: `assignment_${input.earliestPlannedStartIso}_first_signal_${input.firstSignalIso ?? 'none'}_gap_${Number.isFinite(lateGapMin) ? lateGapMin : 'inf'}_min`,
      };
    }
  }

  // Case A: assignment + GPS bekräftar arbete.
  if (hasAssignment && firstWorkVisit) {
    return {
      caseKind: 'A_assignment_with_gps',
      confidence: 'high',
      effectiveWorkStartIso: firstWorkVisit.start,
      requiresReview: false,
      firstWorkVisitKey: firstWorkVisit.placeKey,
      hidNightLeadIn,
      hasInterWorksiteTravel,
      reason: 'assignment_with_stable_gps_on_work_site',
    };
  }

  // Case B: ingen assignment men stable GPS på känd arbetsplats.
  if (!hasAssignment && firstWorkVisit) {
    // Known site → high. Närliggande/möjlig (work_possible) → medium.
    const r = input.visitRelevance.get(firstWorkVisit.placeKey);
    const conf: 'medium' | 'high' = r === 'work_confirmed' ? 'high' : 'medium';
    return {
      caseKind: 'B_known_site_no_assignment',
      confidence: conf,
      effectiveWorkStartIso: firstWorkVisit.start,
      requiresReview: false,
      firstWorkVisitKey: firstWorkVisit.placeKey,
      hidNightLeadIn,
      hasInterWorksiteTravel,
      reason: 'known_workplace_without_planned_assignment',
    };
  }

  // Case D: bara nattlig/privat GPS, ingen arbetsrelevant visit.
  if (!firstWorkVisit && sorted.length > 0) {
    return {
      caseKind: 'D_only_private_then_first_work',
      confidence: 'low',
      effectiveWorkStartIso: null,
      requiresReview: false,
      firstWorkVisitKey: null,
      hidNightLeadIn: true,
      hasInterWorksiteTravel: false,
      reason: 'only_private_or_background_no_work_anchor',
    };
  }

  return {
    caseKind: 'none',
    confidence: 'low',
    effectiveWorkStartIso: null,
    requiresReview: false,
    firstWorkVisitKey: null,
    hidNightLeadIn: false,
    hasInterWorksiteTravel: false,
    reason: 'no_visits',
  };
}
