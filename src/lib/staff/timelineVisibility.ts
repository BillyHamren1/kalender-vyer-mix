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
  | 'micro_stop'            // gps_visit/arrival/departure < 2 min — GPS-brus
  | 'short_stop'            // gps_visit 2–15 min — kort stopp, ej eget pass
  | 'same_site_noise'       // gps_travel där from-coord ≈ to-coord
  | 'low_confidence'        // workRelevance = unknown_requires_lookup / raw_debug_only
  | 'private_background'    // workRelevance = private_or_background (privatzon/natt)
  | 'within_transition'     // mikrohändelse som tillhör ett annat block
  | 'assistant_merged'      // assistant_event som beskriver samma sak som en annan main-rad
  | 'within_journey'        // departure/arrival som ingår i samma journey som en gps_travel-rad
  | 'raw_detail';           // tekniskt event (gps_gap) — alltid raw_only

export interface ClassifiedEvent {
  event: ActualEvent;
  visibility: TimelineVisibility;
  reason_hidden: TimelineHiddenReason | null;
}

/** Tekniska / planerings-events som aldrig hör hemma i huvudjournalen. */
const RAW_DETAIL_KINDS: ReadonlySet<ActualEventKind> = new Set<ActualEventKind>([
  'gps_gap',
  // planned_start är planeringsförväntan, inte en faktisk händelse — visas
  // i header-/Planering-sektionen, aldrig i "Dagens faktiska händelser".
  'planned_start',
]);

/** Tröskel för korta GPS-förflyttningar (mikrostopp/jitter). */
export const MIN_TRAVEL_MIN = 10;
/**
 * Tröskel för korta okända vistelser. 1–15 min på okänd plats blir inget
 * eget projektbesök i huvudjournalen — det räknas som transition eller
 * del av föregående/nästa block. Se short-visit-no-auto-workpass-v1.
 */
export const MIN_VISIT_MIN = 15;
/** Under denna gräns är ett stopp alltid GPS-brus / raw_only. */
export const MIN_NOISE_MIN = 2;
/** Stark arbetsvistelse — visa som "möjlig arbetsvistelse" i journalen. */
export const STRONG_VISIT_MIN = 30;

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

  // Steg 3: assistant-merge.
  //   Assistant-events (assistant_arrival/departure/other) som beskriver samma
  //   fysiska händelse som en närliggande main-rad (gps_arrival, gps_departure,
  //   gps_travel, timer_started, timer_stopped) ska INTE vara egen huvudrad.
  //   De flyttas till raw_only med reason_hidden='assistant_merged' så att
  //   ActualDayPanel kan visa dem i expand-vyn under den faktiska händelsen.
  //
  //   En assistant-rad får BARA stå kvar som main om:
  //     • den inte matchar någon main-rad inom ±20 min (orphan / recovery / prompt)
  //     • eller den kräver action (severity warning/critical eller meta.requires_action)
  const ASSISTANT_MATCH_WINDOW_MS = 20 * 60_000;
  const isAssistantKind = (k: ActualEventKind) =>
    k === 'assistant_arrival' || k === 'assistant_departure' || k === 'assistant_other';
  const counterpartKindsFor = (k: ActualEventKind): ReadonlySet<ActualEventKind> => {
    if (k === 'assistant_arrival') return new Set<ActualEventKind>(['gps_arrival', 'gps_visit', 'timer_started']);
    if (k === 'assistant_departure') return new Set<ActualEventKind>(['gps_departure', 'gps_travel', 'timer_stopped']);
    return new Set<ActualEventKind>(['gps_arrival', 'gps_departure', 'gps_visit', 'gps_travel', 'timer_started', 'timer_stopped']);
  };
  for (let i = 0; i < N; i++) {
    const c = classified[i];
    if (c.visibility !== 'main') continue;
    const ev = c.event;
    if (!isAssistantKind(ev.kind)) continue;

    const meta = (ev.meta ?? {}) as Record<string, unknown>;
    const requiresAction = meta.requires_action === true
      || ev.severity === 'critical'
      || ev.severity === 'warning';
    if (requiresAction) continue;

    const targetKey = (meta.placeKey as string | undefined)
      ?? (meta.target_id as string | undefined)
      ?? null;
    const evMs = new Date(ev.at).getTime();
    if (!Number.isFinite(evMs)) continue;

    const counterparts = counterpartKindsFor(ev.kind);
    let matched = false;
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const other = classified[j];
      if (other.visibility !== 'main') continue;
      const oev = other.event;
      if (!counterparts.has(oev.kind)) continue;
      const oMs = new Date(oev.at).getTime();
      if (!Number.isFinite(oMs)) continue;
      if (Math.abs(oMs - evMs) > ASSISTANT_MATCH_WINDOW_MS) continue;

      // Om vi har targetKey, kräv samma placeKey när motparten har en.
      const oMeta = (oev.meta ?? {}) as Record<string, unknown>;
      const oKey = (oMeta.placeKey as string | undefined) ?? null;
      if (targetKey && oKey && targetKey !== oKey) continue;

      matched = true;
      break;
    }

    if (matched) {
      c.visibility = 'raw_only';
      c.reason_hidden = 'assistant_merged';
    }
  }

  // Steg 4: journey-merge.
  //   Bygg ett "journey_block" där huvudjournalen visar EN rad
  //   "Förflyttning A → B" istället för tre rader (Lämnade A · Travel · Anlände B).
  //
  //   Två varianter:
  //     A) gps_travel finns som main-rad mellan A och B → den blir journey-rad,
  //        och närliggande gps_departure(A)/gps_arrival(B) flyttas till raw_only
  //        med reason_hidden='within_journey'. Travel-eventets meta utökas med
  //        journey_block-data så att UI:s expand kan visa alla tre delhändelser.
  //     B) Endast gps_departure(A) + gps_arrival(B) finns (ingen travel-rad)
  //        inom rimligt fönster → departure-eventet promotas till journey-rad
  //        (label/until/meta utökas) och arrival flyttas till raw_only.
  const JOURNEY_WINDOW_MS = 10 * 60_000;
  const ARR_DEP_PAIR_MAX_MS = 60 * 60_000;

  type JourneyMeta = {
    journey_block: true;
    from_key: string | null;
    to_key: string | null;
    from_label: string | null;
    to_label: string | null;
    departure_at: string | null;
    arrival_at: string | null;
    departure_event_id: string | null;
    arrival_event_id: string | null;
    travel_event_id: string | null;
  };

  // Variant A — travel-driven
  for (let i = 0; i < N; i++) {
    const c = classified[i];
    if (c.visibility !== 'main') continue;
    const ev = c.event;
    if (ev.kind !== 'gps_travel') continue;
    const tp = travelEndpoints(ev);
    if (tp.sameSite) continue;
    const travelStart = new Date(ev.at).getTime();
    const travelEnd = new Date(ev.until ?? ev.at).getTime();
    if (!Number.isFinite(travelStart) || !Number.isFinite(travelEnd)) continue;

    let depEv: ActualEvent | null = null;
    let arrEv: ActualEvent | null = null;

    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const other = classified[j];
      if (other.visibility !== 'main') continue;
      const oev = other.event;
      const oKey = eventPlaceKey(oev);
      const oMs = new Date(oev.at).getTime();
      if (!Number.isFinite(oMs)) continue;

      if (oev.kind === 'gps_departure' && tp.from && oKey === tp.from
        && Math.abs(oMs - travelStart) <= JOURNEY_WINDOW_MS) {
        other.visibility = 'raw_only';
        other.reason_hidden = 'within_journey';
        depEv = oev;
        continue;
      }
      if (oev.kind === 'gps_arrival' && tp.to && oKey === tp.to
        && Math.abs(oMs - travelEnd) <= JOURNEY_WINDOW_MS) {
        // VIKTIGT: göm INTE arrival-raden — destinationens vistelse måste
        // alltid synas som egen huvudrad så att travel inte "sväljer"
        // målplatsen. Vi använder bara dess data till journey_block-meta.
        arrEv = oev;
        continue;
      }
    }

    // Bygg journey_block-meta på travel-eventet så UI kan visa subtitle/expand.
    const labelStr = typeof ev.label === 'string' ? ev.label : '';
    const stripped = labelStr.replace(/^Förflyttning:\s*/, '');
    const [fromLbl, toLbl] = stripped.includes(' → ')
      ? stripped.split(' → ').map(s => s.trim())
      : [null, null];
    const journeyMeta: JourneyMeta = {
      journey_block: true,
      from_key: tp.from,
      to_key: tp.to,
      from_label: depEv?.place ?? fromLbl ?? null,
      to_label: arrEv?.place ?? toLbl ?? null,
      departure_at: depEv?.at ?? ev.at,
      arrival_at: arrEv?.at ?? ev.until ?? null,
      departure_event_id: depEv?.id ?? null,
      arrival_event_id: arrEv?.id ?? null,
      travel_event_id: ev.id,
    };
    classified[i] = {
      ...c,
      event: {
        ...ev,
        meta: { ...(ev.meta ?? {}), ...journeyMeta },
      },
    };
  }

  // Variant B — departure + arrival utan travel
  for (let i = 0; i < N; i++) {
    const c = classified[i];
    if (c.visibility !== 'main') continue;
    const ev = c.event;
    if (ev.kind !== 'gps_departure') continue;
    const fromKey = eventPlaceKey(ev);
    if (!fromKey) continue;
    const depMs = new Date(ev.at).getTime();
    if (!Number.isFinite(depMs)) continue;

    // Finns redan en travel som täcker den här departuren? Hoppa.
    let coveredByTravel = false;
    for (let k = 0; k < N; k++) {
      const o = classified[k];
      if (o.event.kind !== 'gps_travel') continue;
      const tMeta = (o.event.meta ?? {}) as Record<string, unknown>;
      if (tMeta.departure_event_id === ev.id) { coveredByTravel = true; break; }
    }
    if (coveredByTravel) continue;

    // Hitta nästa main-rad — måste vara gps_arrival på annan plats inom fönstret.
    let arrIdx = -1;
    for (let j = i + 1; j < N; j++) {
      const nxt = classified[j];
      if (nxt.visibility !== 'main') continue;
      const nev = nxt.event;
      // Bryts av annan viktig arbetsaktivitet
      if (nev.kind !== 'gps_arrival' && nev.kind !== 'gps_departure' && nev.kind !== 'gps_visit' && nev.kind !== 'gps_travel') break;
      if (nev.kind !== 'gps_arrival') break;
      const nMs = new Date(nev.at).getTime();
      if (!Number.isFinite(nMs)) break;
      if (nMs - depMs > ARR_DEP_PAIR_MAX_MS) break;
      const nKey = eventPlaceKey(nev);
      if (!nKey || nKey === fromKey) break;
      arrIdx = j;
      break;
    }
    if (arrIdx < 0) continue;

    const arrC = classified[arrIdx];
    const arrEv = arrC.event;
    // Behåll arrival som egen main-rad — destinationens vistelse får
    // aldrig sväljas av en syntetisk förflyttningsrad.

    const journeyMeta: JourneyMeta = {
      journey_block: true,
      from_key: fromKey,
      to_key: eventPlaceKey(arrEv),
      from_label: ev.place ?? null,
      to_label: arrEv.place ?? null,
      departure_at: ev.at,
      arrival_at: arrEv.at,
      departure_event_id: ev.id,
      arrival_event_id: arrEv.id,
      travel_event_id: null,
    };
    const fromLbl = ev.place ?? '—';
    const toLbl = arrEv.place ?? '—';
    classified[i] = {
      ...c,
      event: {
        ...ev,
        until: arrEv.at,
        label: `Förflyttning: ${fromLbl} → ${toLbl}`,
        meta: { ...(ev.meta ?? {}), ...journeyMeta, synthetic_journey: true },
      },
    };
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
    case 'assistant_merged': return 'Assistent-händelse (matchad)';
    case 'within_journey': return 'Del av förflyttning';
    case 'raw_detail': return 'Tekniskt rådata';
  }
}
