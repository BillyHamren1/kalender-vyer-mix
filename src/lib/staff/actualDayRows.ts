import { haversineMeters } from './movementDetection';
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';

export type ActualDayRow =
  | {
      source: 'gps';
      key: string;
      kind: 'visit';
      label: string;
      startIso: string;
      endIso: string;
      hours: number;
      debugMergeStatus?: 'preserved' | 'merged';
      debugOriginalSegmentId?: string;
    }
  | {
      source: 'gps';
      key: string;
      kind: 'travel';
      label: string;
      startIso: string;
      endIso: string;
      hours: number;
      debugMergeStatus?: 'preserved' | 'merged';
      debugOriginalSegmentId?: string;
    };

export interface BuildActualDayRowsOptions {
  /**
   * When true, skip all UI smoothing (collapseMicroStops, mergeSamePlaceVisits,
   * mergeAdjacentTravels). Used by Time Debug / debugMode so the UI shows
   * exactly what backend sent.
   */
  preserveRawSegments?: boolean;
}

const SHORT_VISIT_MAX_MIN = 10;
const LOCAL_DETOUR_RADIUS_METERS = 400;

type TimelineVisitItem = {
  type: 'visit';
  key: string;
  visit: PlaceVisit;
  label: string;
  startIso: string;
  endIso: string;
  durationMin: number;
};

type TimelineTravelItem = {
  type: 'travel';
  key: string;
  travel: TravelGap;
  from: PlaceVisit;
  to: PlaceVisit;
  fromLabel: string;
  toLabel: string;
  startIso: string;
  endIso: string;
  durationMin: number;
};

type TimelineItem = TimelineVisitItem | TimelineTravelItem;

const minutesBetween = (startIso: string, endIso: string) =>
  Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000));

const samePlace = (a: PlaceVisit, b: PlaceVisit) => {
  if (a.knownSite && b.knownSite) return a.knownSite.id === b.knownSite.id;
  if (!a.knownSite && !b.knownSite) {
    return haversineMeters(a.centre, b.centre) <= LOCAL_DETOUR_RADIUS_METERS;
  }
  return false;
};

const buildVisitItem = (visit: PlaceVisit, label: string, startIso = visit.start, endIso = visit.end): TimelineVisitItem => ({
  type: 'visit',
  key: `visit:${visit.placeKey}:${startIso}`,
  visit,
  label,
  startIso,
  endIso,
  durationMin: minutesBetween(startIso, endIso),
});

const buildTravelItem = (
  from: PlaceVisit,
  to: PlaceVisit,
  fromLabel: string,
  toLabel: string,
  startIso: string,
  endIso: string,
  key: string,
  travel: TravelGap,
): TimelineTravelItem => ({
  type: 'travel',
  key,
  travel,
  from,
  to,
  fromLabel,
  toLabel,
  startIso,
  endIso,
  durationMin: minutesBetween(startIso, endIso),
});

function collapseMicroStops(items: TimelineItem[]): TimelineItem[] {
  const working = [...items];

  let changed = true;
  while (changed) {
    changed = false;

    for (let i = 0; i < working.length; i += 1) {
      const current = working[i];
      if (!current || current.type !== 'visit' || current.durationMin > SHORT_VISIT_MAX_MIN) continue;

      const prevTravel: TimelineTravelItem | null = working[i - 1]?.type === 'travel' ? working[i - 1] as TimelineTravelItem : null;
      const nextTravel: TimelineTravelItem | null = working[i + 1]?.type === 'travel' ? working[i + 1] as TimelineTravelItem : null;
      const prevVisit: TimelineVisitItem | null = working[i - 2]?.type === 'visit' ? working[i - 2] as TimelineVisitItem : null;
      const nextVisit: TimelineVisitItem | null = working[i + 2]?.type === 'visit' ? working[i + 2] as TimelineVisitItem : null;

      if (prevTravel && nextTravel && prevVisit && nextVisit && samePlace(prevVisit.visit, nextVisit.visit)) {
        const mergedVisit = buildVisitItem(prevVisit.visit, prevVisit.label, prevVisit.startIso, nextVisit.endIso);
        working.splice(i - 2, 5, mergedVisit);
        changed = true;
        break;
      }

      if (prevTravel && nextTravel) {
        const mergedTravel = buildTravelItem(
          prevTravel.from,
          nextTravel.to,
          prevTravel.fromLabel,
          nextTravel.toLabel,
          prevTravel.startIso,
          nextTravel.endIso,
          `${prevTravel.key}::${current.key}::${nextTravel.key}`,
          prevTravel.travel,
        );

        if (samePlace(mergedTravel.from, mergedTravel.to)) {
          const mergedVisit = buildVisitItem(mergedTravel.from, prevTravel.fromLabel, prevTravel.from.start, nextTravel.to.end);
          working.splice(i - 2, 5, mergedVisit);
        } else {
          working.splice(i - 1, 3, mergedTravel);
        }
        changed = true;
        break;
      }
    }
  }

  return working;
}

function mergeSamePlaceVisits(items: TimelineItem[]): TimelineItem[] {
  const working = [...items];
  let i = 0;

  while (i <= working.length - 3) {
    const left = working[i];
    const middle = working[i + 1];
    const right = working[i + 2];

    if (left?.type === 'visit' && middle?.type === 'travel' && right?.type === 'visit' && samePlace(left.visit, right.visit)) {
      const mergedVisit = buildVisitItem(left.visit, left.label, left.startIso, right.endIso);
      working.splice(i, 3, mergedVisit);
      i = Math.max(0, i - 2);
      continue;
    }

    i += 1;
  }

  return working;
}

function mergeAdjacentTravels(items: TimelineItem[]): TimelineItem[] {
  const merged: TimelineItem[] = [];

  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last?.type === 'travel' && item.type === 'travel') {
      merged[merged.length - 1] = buildTravelItem(
        last.from,
        item.to,
        last.fromLabel,
        item.toLabel,
        last.startIso,
        item.endIso,
        `${last.key}::${item.key}`,
        last.travel,
      );
      continue;
    }

    merged.push(item);
  }

  return merged;
}

export function buildActualDayRows(
  visits: PlaceVisit[],
  travels: TravelGap[],
  visitLabels: string[],
  options: BuildActualDayRowsOptions = {},
): ActualDayRow[] {
  if (visits.length === 0) return [];
  const preserveRaw = options.preserveRawSegments === true;

  const labels = new WeakMap<PlaceVisit, string>();
  visits.forEach((visit, index) => {
    const label = visit.knownSite?.name ?? visitLabels[index] ?? `${visit.centre.lat.toFixed(4)}, ${visit.centre.lng.toFixed(4)}`;
    labels.set(visit, label);
  });

  const timeline: TimelineItem[] = [];
  for (let i = 0; i < visits.length; i += 1) {
    const visit = visits[i];
    const visitLabel = labels.get(visit) ?? `${visit.centre.lat.toFixed(4)}, ${visit.centre.lng.toFixed(4)}`;
    timeline.push(buildVisitItem(visit, visitLabel));

    const travel = travels[i];
    if (!travel) continue;

    const fromLabel = labels.get(travel.from) ?? visitLabel;
    const toLabel = labels.get(travel.to) ?? travel.to.knownSite?.name ?? `${travel.to.centre.lat.toFixed(4)}, ${travel.to.centre.lng.toFixed(4)}`;
    // In preserveRaw mode, keep zero-distance "travel" segments visible too.
    if (!preserveRaw && samePlace(travel.from, travel.to)) continue;

    timeline.push(
      buildTravelItem(travel.from, travel.to, fromLabel, toLabel, travel.start, travel.end, travel.key, travel),
    );
  }

  let normalized = [...timeline].sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  if (!preserveRaw) {
    normalized = collapseMicroStops(normalized);
    normalized = mergeSamePlaceVisits(normalized);
    normalized = mergeAdjacentTravels(normalized);
  }

  return normalized.reduce<ActualDayRow[]>((rows, item) => {
    if (item.type === 'visit') {
      rows.push({
        source: 'gps',
        key: item.key,
        kind: 'visit',
        label: item.label,
        startIso: item.startIso,
        endIso: item.endIso,
        hours: item.durationMin / 60,
        ...(preserveRaw
          ? { debugMergeStatus: 'preserved', debugOriginalSegmentId: item.key }
          : {}),
      });
      return rows;
    }

    if (!preserveRaw && samePlace(item.from, item.to)) return rows;

    rows.push({
      source: 'gps',
      key: item.key,
      kind: 'travel',
      label: `Resa: ${item.fromLabel} → ${item.toLabel}`,
      startIso: item.startIso,
      endIso: item.endIso,
      hours: item.durationMin / 60,
      ...(preserveRaw
        ? { debugMergeStatus: 'preserved', debugOriginalSegmentId: item.key }
        : {}),
    });
    return rows;
  }, []);
}