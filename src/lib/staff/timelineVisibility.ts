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

function eventPlaceKey(ev: ActualEvent): string | null {
  const m = (ev.meta ?? {}) as Record<string, unknown>;
  const k = m.placeKey;
  return typeof k === 'string' ? k : null;
}

function travelEndpoints(ev: ActualEvent): { from: string | null; to: string | null; sameSite: boolean } {
  const m = (ev.meta ?? {}) as Record<string, unknown>;
  const from = typeof m.fromPlaceKey === 'string' ? (m.fromPlaceKey as string) : null;
  const to = typeof m.toPlaceKey === 'string' ? (m.toPlaceKey as string) : null;
  const sameSite = !!m.samePlaceTravel
    || (from != null && from === to);
  return { from, to, sameSite };
}

/**
 * Coalesce-pass: slår samman korta stopp/same-site-travels med närliggande
 * arbetsblock så att huvudjournalen visar t.ex.
 *   "12:24–13:42 FA Warehouse · intermittent GPS"
 * istället för en arrival, en visit och en same-site-travel-rad.
 *
 * Regler:
 *   • En sequence av main-events (gps_arrival/gps_visit) på samma placeKey,
 *     ev. separerade av gps_travel där from===to (samePlaceTravel),
 *     slås ihop till EN syntetisk gps_visit. Mellanliggande events markeras
 *     visibility='raw_only' med reason_hidden='within_transition'.
 *   • Kort okänd visit/arrival/departure (< MIN_VISIT_MIN) som ligger MELLAN
 *     två kända arbetsplatser i sekvensen → reason_hidden='within_transition'
 *     (visas inte separat — tillhör den närliggande resan).
 */
export function classifyTimelineCoalesced(events: ActualEvent[]): ClassifiedEvent[] {
  const classified = events.map(classifyEventVisibility);

  // Steg 1: same-site-merge. Iterera över main-events; hitta körningar
  // [arrival|visit på X] (… same-site travel|kort okänd …) [arrival|visit på X].
  // Markera mellanliggande events raw_only/within_transition och utöka det
  // första visit-eventets duration/until till att täcka hela blocket.
  const N = classified.length;
  for (let i = 0; i < N; i++) {
    const c = classified[i];
    if (c.visibility !== 'main') continue;
    const baseKey = eventPlaceKey(c.event);
    const isPlaceEvent = c.event.kind === 'gps_visit' || c.event.kind === 'gps_arrival';
    if (!baseKey || !isPlaceEvent) continue;

    let blockEnd = c.event.until ?? c.event.at;
    let lastIdxInBlock = i;
    let merged = false;

    for (let j = i + 1; j < N; j++) {
      const nxt = classified[j];
      const ev = nxt.event;
      const meta = (ev.meta ?? {}) as Record<string, unknown>;

      // Same-site travel mellan två gps_visit på samma plats — del av blocket
      if (ev.kind === 'gps_travel') {
        const tp = travelEndpoints(ev);
        if (tp.sameSite && (tp.from === baseKey || tp.from === null)) {
          nxt.visibility = 'raw_only';
          nxt.reason_hidden = 'within_transition';
          blockEnd = ev.until ?? blockEnd;
          lastIdxInBlock = j;
          merged = true;
          continue;
        }
        // Travel till annan plats avslutar blocket
        break;
      }

      // Ny visit/arrival på samma place → del av blocket
      if ((ev.kind === 'gps_visit' || ev.kind === 'gps_arrival') && eventPlaceKey(ev) === baseKey) {
        nxt.visibility = 'raw_only';
        nxt.reason_hidden = 'within_transition';
        blockEnd = ev.until ?? ev.at ?? blockEnd;
        lastIdxInBlock = j;
        merged = true;
        continue;
      }

      // gps_departure på samma plats avslutar blocket men hör till det
      if (ev.kind === 'gps_departure' && eventPlaceKey(ev) === baseKey) {
        blockEnd = ev.at ?? blockEnd;
        lastIdxInBlock = j;
        // Departure får synas i huvudjournalen som blockets slut.
        break;
      }

      // Kort okänd vistelse mellan kända platser → within_transition
      if (
        nxt.visibility === 'raw_only'
        && (ev.kind === 'gps_visit' || ev.kind === 'gps_arrival' || ev.kind === 'gps_departure')
        && (ev.durationMin ?? 0) < MIN_VISIT_MIN
        && meta.workRelevance !== 'work_confirmed'
      ) {
        nxt.reason_hidden = 'within_transition';
        continue;
      }

      // Annars — blocket bryts
      break;
    }

    if (merged) {
      // Förläng base-eventets visningsperiod genom en grundkopia av meta.
      const baseEv = classified[i].event;
      const newMeta = { ...(baseEv.meta ?? {}), intermittentGps: true, blockEndAt: blockEnd, blockMergedCount: lastIdxInBlock - i };
      const baseStartMs = new Date(baseEv.at).getTime();
      const blockEndMs = new Date(blockEnd).getTime();
      const newDur = Number.isFinite(baseStartMs) && Number.isFinite(blockEndMs)
        ? Math.max(baseEv.durationMin ?? 0, Math.round((blockEndMs - baseStartMs) / 60_000))
        : baseEv.durationMin;
      classified[i] = {
        ...classified[i],
        event: {
          ...baseEv,
          until: blockEnd,
          durationMin: newDur,
          label: baseEv.place
            ? `${baseEv.place} · intermittent GPS`
            : `${baseEv.label} · intermittent GPS`,
          meta: newMeta,
        },
      };
      i = lastIdxInBlock; // hoppa förbi det vi redan slagit ihop
    }
  }

  // Steg 2: korta okända stopp mellan två kända arbetsplatser → within_transition.
  // Hittar mönster [main known A] [main raw_only kort okänd] [main known B].
  for (let i = 1; i < N - 1; i++) {
    const c = classified[i];
    if (c.visibility !== 'raw_only') continue;
    if (c.reason_hidden !== 'micro_stop' && c.reason_hidden !== 'low_confidence') continue;
    const prev = [...classified.slice(0, i)].reverse().find(x => x.visibility === 'main');
    const next = classified.slice(i + 1).find(x => x.visibility === 'main');
    const prevKnown = !!prev && (prev.event.internal_match_status === 'matched');
    const nextKnown = !!next && (next.event.internal_match_status === 'matched');
    if (prevKnown && nextKnown) {
      c.reason_hidden = 'within_transition';
    }
  }

  return classified;
}

/** Klassificera hela listan utan coalesce. */
export function classifyTimeline(events: ActualEvent[]): ClassifiedEvent[] {
  return classifyTimelineCoalesced(events);
}

/** mainTimeline = endast events markerade visibility='main' (efter coalesce). */
export function mainTimeline(events: ActualEvent[]): ActualEvent[] {
  return classifyTimelineCoalesced(events)
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
  for (const c of classifyTimelineCoalesced(events)) {
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
