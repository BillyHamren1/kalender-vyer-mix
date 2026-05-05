/**
 * Timeline visibility — mainTimeline vs rawTimeline.
 *
 * Varje ActualEvent klassificeras i två nivåer:
 *   • main      — visas i "Dagens faktiska händelser" (huvudjournal)
 *   • raw_only  — döljs från huvudjournal men finns kvar under
 *                 "Visa alla händelser" / "Rå GPS / debug".
 *
 * INGET RADERAS. Vi sätter bara visibility + reason_hidden så att UI
 * kan välja vy och visa varför något hamnat i raw-spåret.
 *
 * Speglar policyn i:
 *   • mem://constraints/short-visit-no-auto-workpass-v1
 *   • mem://features/field-staff/private-zones-v1
 *   • Huvudjournal-kommentaren i ActualDayPanel.compactEvents.
 */

import type { ActualEvent, ActualEventKind } from '@/lib/staff/actualStaffDayModel';

export type TimelineVisibility = 'main' | 'raw_only';

export type TimelineHiddenReason =
  | 'short_movement'        // gps_travel < 10 min mellan okända/oklara platser
  | 'micro_stop'            // gps_visit/arrival/departure < 15 min utan match
  | 'same_site_noise'       // gps_travel där from-coord ≈ to-coord
  | 'low_confidence'        // workRelevance = unknown_requires_lookup / raw_debug_only
  | 'private_background'    // workRelevance = private_or_background (privatzon/natt)
  | 'within_transition'     // mikrohändelse som tillhör ett annat block
  | 'raw_detail';           // tekniskt event (gps_gap) — alltid raw_only

export interface ClassifiedEvent {
  event: ActualEvent;
  visibility: TimelineVisibility;
  reason_hidden: TimelineHiddenReason | null;
}

/** Tekniska events som aldrig hör hemma i huvudjournalen. */
const RAW_DETAIL_KINDS: ReadonlySet<ActualEventKind> = new Set<ActualEventKind>([
  'gps_gap',
]);

/** Tröskel för korta GPS-förflyttningar (mikrostopp/jitter). */
export const MIN_TRAVEL_MIN = 10;
/**
 * Tröskel för korta okända vistelser. 1–15 min på okänd plats blir inget
 * eget projektbesök i huvudjournalen — det räknas som transition eller
 * del av föregående/nästa block. Se short-visit-no-auto-workpass-v1.
 */
export const MIN_VISIT_MIN = 15;

function isMatched(ev: ActualEvent): boolean {
  const meta = (ev.meta ?? {}) as Record<string, unknown>;
  return ev.internal_match_status === 'matched'
    || meta.internal_match_status === 'matched';
}

function workRelevance(ev: ActualEvent): string | null {
  const meta = (ev.meta ?? {}) as Record<string, unknown>;
  const r = meta.workRelevance;
  return typeof r === 'string' ? r : null;
}

/**
 * Pure classifier — returnerar visibility + reason_hidden för ett event.
 * Inget filtreras bort; det är upp till callern att välja vy.
 */
export function classifyEventVisibility(ev: ActualEvent): ClassifiedEvent {
  // 1) Tekniska events: alltid raw_only
  if (RAW_DETAIL_KINDS.has(ev.kind)) {
    return { event: ev, visibility: 'raw_only', reason_hidden: 'raw_detail' };
  }

  const meta = (ev.meta ?? {}) as Record<string, unknown>;
  const dur = ev.durationMin ?? 0;
  const rel = workRelevance(ev);
  const matched = isMatched(ev);
  const workConfirmed = rel === 'work_confirmed';

  // 2) Privat/bakgrund vinner alltid (privatzon, natt utan arbete)
  if (rel === 'private_or_background') {
    return { event: ev, visibility: 'raw_only', reason_hidden: 'private_background' };
  }

  // 3) Brus-klassade kluster
  if (rel === 'raw_debug_only') {
    return { event: ev, visibility: 'raw_only', reason_hidden: 'low_confidence' };
  }

  // 4) Korta GPS-förflyttningar
  if (ev.kind === 'gps_travel') {
    const fromCentre = meta.fromCentre as { lat: number; lng: number } | null | undefined;
    const toCentre = meta.toCentre as { lat: number; lng: number } | null | undefined;
    const bothKnown = !!meta.bothKnown;
    const sameSpot =
      !bothKnown
      && fromCentre && toCentre
      && Math.abs(fromCentre.lat - toCentre.lat) < 0.0005
      && Math.abs(fromCentre.lng - toCentre.lng) < 0.0005;
    if (sameSpot) {
      return { event: ev, visibility: 'raw_only', reason_hidden: 'same_site_noise' };
    }
    if (dur > 0 && dur < MIN_TRAVEL_MIN && !bothKnown) {
      return { event: ev, visibility: 'raw_only', reason_hidden: 'short_movement' };
    }
  }

  // 5) Korta okända besök / mikrostopp
  if (ev.kind === 'gps_visit' || ev.kind === 'gps_arrival' || ev.kind === 'gps_departure') {
    if (!matched && !workConfirmed && dur > 0 && dur < MIN_VISIT_MIN) {
      return { event: ev, visibility: 'raw_only', reason_hidden: 'micro_stop' };
    }
    // Okänd plats utan tydlig arbetskoppling — visa endast i raw.
    if (!matched && rel === 'unknown_requires_lookup' && dur < MIN_VISIT_MIN) {
      return { event: ev, visibility: 'raw_only', reason_hidden: 'low_confidence' };
    }
  }

  // 6) Default: huvudjournal
  return { event: ev, visibility: 'main', reason_hidden: null };
}

/** Klassificera hela listan. Bevarar ordning. */
export function classifyTimeline(events: ActualEvent[]): ClassifiedEvent[] {
  return events.map(classifyEventVisibility);
}

/** mainTimeline = endast events markerade visibility='main'. */
export function mainTimeline(events: ActualEvent[]): ActualEvent[] {
  return classifyTimeline(events)
    .filter(c => c.visibility === 'main')
    .map(c => c.event);
}

/** rawTimeline = alla events i ursprunglig ordning. Inget raderas. */
export function rawTimeline(events: ActualEvent[]): ActualEvent[] {
  return [...events];
}

/** Map från event.id → reason_hidden för UI-tooltips i raw-vyn. */
export function buildHiddenReasonMap(events: ActualEvent[]): Map<string, TimelineHiddenReason> {
  const map = new Map<string, TimelineHiddenReason>();
  for (const c of classifyTimeline(events)) {
    if (c.visibility === 'raw_only' && c.reason_hidden) {
      map.set(c.event.id, c.reason_hidden);
    }
  }
  return map;
}

/** Mänskligt label för UI. */
export function hiddenReasonLabel(reason: TimelineHiddenReason): string {
  switch (reason) {
    case 'short_movement': return 'Kort förflyttning';
    case 'micro_stop': return 'Mikrostopp';
    case 'same_site_noise': return 'GPS-brus runt samma plats';
    case 'low_confidence': return 'Låg tilltro';
    case 'private_background': return 'Privat/bakgrund';
    case 'within_transition': return 'Del av transition';
    case 'raw_detail': return 'Tekniskt rådata';
  }
}
