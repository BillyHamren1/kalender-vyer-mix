// This is not a second Time Engine.
// It only resolves display priority from existing engine evidence.
// Planning is context, not proof of location.
// Actual location is resolved from GPS/geofence/engine evidence first.
// Booking assignment must not be used as primary location truth.
// Large project may be the final label even when a child booking is the geo anchor.
//
// resolveActualLocationTargetForBlock — pure UI/derive-helper för
// /staff-management/time-reports.
//
// Den GÖR INTE GPS-matchning. Den GÖR INTE en parallell engine. Den läser
// bara redan-resolved engine-evidens på blocket (targetType/targetId/
// targetLabel + projectName/largeProjectName/bookingName/locationName/
// warehouseName/displayTitle) och bestämmer vilket label som ska VISAS
// och om planning bara får synas som badge.
//
// Regel:
// 1. Om engine redan har en target → den vinner. Planning visas bara som
//    badge om den skiljer sig (geo disagreed → "Planerat: X").
// 2. Om engine inte har target men blocket har annan presence-evidens för
//    dagen → behåll engine-fallback ("Okänd plats" / "Arbete – okänd
//    plats"). Planning visas som badge, ALDRIG som titel.
// 3. Endast om dagen helt saknar evidens (inga pings, inga engine-block)
//    får planning agera fallback-titel.
//
// Helpern är ren och unit-testbar.

import { resolveGanttBlockTitle, type GanttBlockInputExtended } from './resolveGanttBlockTitle';

export type ActualLocationSource =
  | 'engine_target'           // engine har redan resolved target → vinner
  | 'large_project_promoted'  // engine target är largeProjectName → label = LP
  | 'planning_fallback'       // dagen helt utan evidens → planning = enda källan
  | 'unknown';                // engine unknown + evidens finns → behåll Okänd plats

export interface ActualLocationResolutionInput {
  block: GanttBlockInputExtended;
  /** Planerade jobb-labels för personalen den dagen (rena namn, redan filtrerade). */
  plannedLabels: string[];
  /**
   * True om dagen har NÅGON faktisk presence/engine-evidens för personen
   * (GPS-pings, andra engine-block med target, place_visits, time_reports
   * eller workday). Är detta true får planning aldrig bli fallback-titel
   * — bara badge.
   */
  hasDayEvidence: boolean;
}

export interface ActualLocationResolution {
  /** Den faktiska text som ska renderas i Gantt-blockets titel. */
  finalTitle: string;
  source: ActualLocationSource;
  /**
   * Om planning skiljer sig från det engine resolved (eller engine är
   * unknown men evidens finns) — visa som liten "Planerat: X"-badge.
   * null om ingen badge ska visas (planning matchar, saknas, eller blev
   * själva titeln).
   */
  plannedBadgeLabel: string | null;
  diagnostics: {
    engineLabel: string | null;
    actualResolvedLabel: string | null;
    plannedLabel: string | null;
    finalDisplayedLabel: string;
    usedPlanningAsFallback: boolean;
    usedPlanningAsTieBreaker: boolean;
    usedPlanningAsBadgeOnly: boolean;
    ignoredPlanningBecauseGeoDisagreed: boolean;
    reason: string;
  };
}

/** Likställer label-strängar för jämförelse (case + whitespace insensitive). */
const norm = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Engine anses ha resolvat en faktisk target när blocket har:
 *   - explicit projectName / largeProjectName / bookingName /
 *     locationName / warehouseName / eventName / displayTitle, ELLER
 *   - targetType + targetId + ett mänskligt targetLabel (ej generiskt).
 *
 * Notera: vi tittar inte på block.title eftersom det redan kan vara satt
 * från generisk fallback i tidigare lager.
 */
function engineHasResolvedTarget(b: GanttBlockInputExtended): boolean {
  if (b.displayTitle && b.displayTitle.trim()) return true;
  if (b.projectName && b.projectName.trim()) return true;
  if (b.largeProjectName && b.largeProjectName.trim()) return true;
  if (b.bookingName && b.bookingName.trim()) return true;
  if (b.eventName && b.eventName.trim()) return true;
  if (b.locationName && b.locationName.trim()) return true;
  if (b.warehouseName && b.warehouseName.trim()) return true;
  if (b.targetType && b.targetId && b.targetLabel) {
    // targetLabel måste vara icke-generisk — använd resolveGanttBlockTitle
    // i strict-läge (utan plannedAssignmentLabel) för att avgöra det.
    const strict = resolveGanttBlockTitle({
      ...b,
      plannedAssignmentLabel: null,
      title: b.title,
    });
    // Om strict-resolvern returnerar något annat än fallback-strängarna
    // betyder det att den hittade ett mänskligt namn på targetLabel.
    if (strict !== 'Okänd plats' && strict !== 'Arbete – okänd plats') return true;
  }
  return false;
}

export function resolveActualLocationTargetForBlock(
  input: ActualLocationResolutionInput,
): ActualLocationResolution {
  const { block, plannedLabels, hasDayEvidence } = input;

  // Plocka planning-label deterministiskt: enda planerade jobbet → bra signal,
  // flera olika → undvik godtyckligt val (visa bara om unikt).
  const plannedLabel: string | null =
    plannedLabels.length === 1 && plannedLabels[0]?.trim()
      ? plannedLabels[0].trim()
      : null;

  // Strict engine-titel: skicka EJ in plannedAssignmentLabel — vi vill veta
  // vad engine själv kan säga utan planning-stöd.
  const strictBlock: GanttBlockInputExtended = {
    ...block,
    plannedAssignmentLabel: null,
  };
  const strictTitle = resolveGanttBlockTitle(strictBlock);

  const engineHasTarget = engineHasResolvedTarget(block);

  // Engine target finns → ENGINE VINNER ALLTID. Planning är badge max.
  if (engineHasTarget) {
    const isLargeProject = !!(block.largeProjectName && block.largeProjectName.trim());
    const source: ActualLocationSource = isLargeProject
      ? 'large_project_promoted'
      : 'engine_target';

    const planningDisagrees =
      !!plannedLabel && norm(plannedLabel) !== norm(strictTitle);

    const badge = planningDisagrees ? plannedLabel : null;

    return {
      finalTitle: strictTitle,
      source,
      plannedBadgeLabel: badge,
      diagnostics: {
        engineLabel: strictTitle,
        actualResolvedLabel: strictTitle,
        plannedLabel,
        finalDisplayedLabel: strictTitle,
        usedPlanningAsFallback: false,
        usedPlanningAsTieBreaker: false,
        usedPlanningAsBadgeOnly: !!badge,
        ignoredPlanningBecauseGeoDisagreed: planningDisagrees,
        reason: planningDisagrees
          ? `engine resolved ${strictTitle}; planning (${plannedLabel}) shown as badge only`
          : `engine resolved ${strictTitle}`,
      },
    };
  }

  // Engine har INGEN target. Är det ett block-typ där planning är ofarligt
  // som fallback (transport/break/needs_review) → returnera bara strict.
  // För dessa visar vi inte planning-badge heller.
  if (block.kind === 'transport' || block.kind === 'break' || block.kind === 'needs_review') {
    return {
      finalTitle: strictTitle,
      source: 'unknown',
      plannedBadgeLabel: null,
      diagnostics: {
        engineLabel: strictTitle,
        actualResolvedLabel: null,
        plannedLabel,
        finalDisplayedLabel: strictTitle,
        usedPlanningAsFallback: false,
        usedPlanningAsTieBreaker: false,
        usedPlanningAsBadgeOnly: false,
        ignoredPlanningBecauseGeoDisagreed: false,
        reason: `${block.kind} block — planning never used`,
      },
    };
  }

  // Kvar: kind === 'work' eller 'unknown'. Engine har inget target.
  // Här gäller hårda kravet: om dagen har faktisk evidens → behåll
  // engine-fallback. Planning får bara bli badge.
  if (hasDayEvidence) {
    return {
      finalTitle: strictTitle, // 'Okänd plats' eller 'Arbete – okänd plats'
      source: 'unknown',
      plannedBadgeLabel: plannedLabel,
      diagnostics: {
        engineLabel: strictTitle,
        actualResolvedLabel: null,
        plannedLabel,
        finalDisplayedLabel: strictTitle,
        usedPlanningAsFallback: false,
        usedPlanningAsTieBreaker: false,
        usedPlanningAsBadgeOnly: !!plannedLabel,
        ignoredPlanningBecauseGeoDisagreed: !!plannedLabel,
        reason: plannedLabel
          ? `engine has no target but day has evidence — keep ${strictTitle}; planning (${plannedLabel}) shown as badge only`
          : `engine has no target but day has evidence — keep ${strictTitle}`,
      },
    };
  }

  // Ingen evidens alls för dagen — då först får planning agera fallback-titel.
  if (plannedLabel) {
    return {
      finalTitle: plannedLabel,
      source: 'planning_fallback',
      plannedBadgeLabel: null,
      diagnostics: {
        engineLabel: strictTitle,
        actualResolvedLabel: null,
        plannedLabel,
        finalDisplayedLabel: plannedLabel,
        usedPlanningAsFallback: true,
        usedPlanningAsTieBreaker: false,
        usedPlanningAsBadgeOnly: false,
        ignoredPlanningBecauseGeoDisagreed: false,
        reason: `no day evidence — planning (${plannedLabel}) used as fallback title`,
      },
    };
  }

  // Helt utan signal. Behåll engine-fallback.
  return {
    finalTitle: strictTitle,
    source: 'unknown',
    plannedBadgeLabel: null,
    diagnostics: {
      engineLabel: strictTitle,
      actualResolvedLabel: null,
      plannedLabel: null,
      finalDisplayedLabel: strictTitle,
      usedPlanningAsFallback: false,
      usedPlanningAsTieBreaker: false,
      usedPlanningAsBadgeOnly: false,
      ignoredPlanningBecauseGeoDisagreed: false,
      reason: 'no engine target, no day evidence, no unique planned label',
    },
  };
}

export const __test__ = { engineHasResolvedTarget };
