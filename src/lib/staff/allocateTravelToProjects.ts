/**
 * allocateTravelToProjects
 * ─────────────────────────
 * Pure helper. Tar en `StaffDaySegment[]` i tidsordning och kompletterar
 * varje `kind==='travel'`-segment med projekt-/jobbtillhörighet enligt
 * regeln "restid tillhör jobbet man åker TILL" (med fallback för
 * sista-resan-på-dagen).
 *
 * Ändrar ALDRIG `kind`, durations, tider eller labels. Mutterar bara nya
 * fält:
 *   - travelBelongsToProjectId / -Name
 *   - travelBelongsToTargetId / -Name
 *   - travelAllocationReason
 *
 * Hem/privat-detektion görs valfritt via `blocksById` (DayBlock-map) — om
 * motsvarande JourneyBlock har `toPlace.lookupStatus === 'unknown_no_coords'`
 * eller en label som matchar "hem"/"home"/"boende" så markeras resan som
 * privat istället för unresolved.
 */

import type { StaffDaySegment, TravelAllocationReason } from './staffDayTimeline';
import type { DayBlock, JourneyBlock } from './dayBlockTimeline';

const WORK_KINDS = new Set(['project', 'warehouse']);
const HOME_PATTERN = /\b(hem|home|bostad|boende|privat|private)\b/i;

function isWork(seg: StaffDaySegment): boolean {
  return WORK_KINDS.has(seg.kind);
}

function findNextWork(segments: StaffDaySegment[], fromIndex: number): StaffDaySegment | null {
  for (let i = fromIndex + 1; i < segments.length; i += 1) {
    if (isWork(segments[i])) return segments[i];
  }
  return null;
}

function findPrevWork(segments: StaffDaySegment[], fromIndex: number): StaffDaySegment | null {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (isWork(segments[i])) return segments[i];
  }
  return null;
}

function inheritFromWork(
  travel: StaffDaySegment,
  work: StaffDaySegment,
  reason: TravelAllocationReason,
): StaffDaySegment {
  return {
    ...travel,
    travelBelongsToProjectId: work.sourceBlockId,
    travelBelongsToProjectName: work.label,
    travelBelongsToTargetId: work.sourceBlockId,
    travelBelongsToTargetName: work.label,
    travelAllocationReason: reason,
  };
}

function markUnresolved(travel: StaffDaySegment): StaffDaySegment {
  return {
    ...travel,
    travelBelongsToProjectId: null,
    travelBelongsToProjectName: null,
    travelBelongsToTargetId: null,
    travelBelongsToTargetName: null,
    travelAllocationReason: 'unresolved_travel_allocation',
    reviewRequired: true,
  };
}

function markPrivate(travel: StaffDaySegment): StaffDaySegment {
  return {
    ...travel,
    travelBelongsToProjectId: null,
    travelBelongsToProjectName: null,
    travelBelongsToTargetId: null,
    travelBelongsToTargetName: null,
    travelAllocationReason: 'travel_to_private_not_allocated',
  };
}

function endpointLooksPrivate(journey: JourneyBlock | undefined): boolean {
  if (!journey) return false;
  const to = journey.toPlace;
  const toLabel = to?.label ?? journey.toLabel ?? '';
  if (toLabel && HOME_PATTERN.test(toLabel)) return true;
  // Bara obekräftad endpoint + sista-på-dagen-fallet hanteras i caller.
  return false;
}

/**
 * Allokerar restidssegment till projekt/jobb.
 *
 * @param segments  Tidssorterad lista — kommer från `buildStaffDayTimeline`.
 * @param blocksById  Valfritt: lookup-karta `id → DayBlock` för att kunna
 *                    läsa JourneyBlock.toPlace vid hem/privat-detektion.
 */
export function allocateTravelToProjects(
  segments: StaffDaySegment[],
  blocksById?: Map<string, DayBlock>,
): StaffDaySegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return segments;

  const result = segments.slice();
  for (let i = 0; i < result.length; i += 1) {
    const seg = result[i];
    if (seg.kind !== 'travel') continue;

    const nextWork = findNextWork(result, i);
    const prevWork = findPrevWork(result, i);

    if (nextWork && !prevWork) {
      result[i] = inheritFromWork(seg, nextWork, 'travel_to_first_job');
      continue;
    }
    if (nextWork && prevWork) {
      result[i] = inheritFromWork(
        seg,
        nextWork,
        'travel_between_jobs_allocated_to_destination',
      );
      continue;
    }
    if (prevWork && !nextWork) {
      // Sista resan efter sista jobbet.
      const journey = blocksById?.get(seg.sourceBlockId);
      const journeyBlock = journey && journey.kind === 'journey' ? (journey as JourneyBlock) : undefined;
      if (endpointLooksPrivate(journeyBlock)) {
        result[i] = markPrivate(seg);
      } else {
        result[i] = inheritFromWork(
          seg,
          prevWork,
          'travel_after_last_job_allocated_to_last_job',
        );
      }
      continue;
    }

    // Inget prev/next work — kan inte allokeras.
    result[i] = markUnresolved(seg);
  }

  return result;
}
