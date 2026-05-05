/**
 * Day Block Timeline
 * ──────────────────
 * Bygger huvudjournalen som en sekvens av BLOCK istället för en lista av råa
 * tekniska events. Detta ersätter "lista av kinds"-renderingen i
 * ActualDayPanel så att admin ser dagen som:
 *
 *   PresenceBlock  →  JourneyBlock  →  PresenceBlock  →  JourneyBlock …
 *
 * Tekniska events (timer_started/stopped, time_report_*, gps_arrival/departure,
 * assistant_*, server_*) dras IN i blocket de logiskt tillhör och visas bara i
 * blockets expand-vy. Inget raderas — blocken refererar till sina källrader.
 *
 * Input: mainTimeline-events (efter classifyTimelineCoalesced) + actualVisits.
 * Output: BlockTimeline[].
 */

import type { ActualEvent } from '@/lib/staff/actualStaffDayModel';

export type BlockKind = 'presence' | 'journey' | 'gap';

export type PresenceStrength =
  | 'strong_visit'
  | 'possible_visit'
  | 'short_stop'
  | 'project'
  /** Härledd från time_report-fönster utan GPS-stöd. */
  | 'time_report_window'
  /** Härledd från sammanhängande journey-endpoints (var här mellan resor). */
  | 'inferred_between_journeys';

/** Diagnostisk markör för ett glapp i journalen där presence saknas. */
export type GapReason =
  | 'no_visit_generated'        // GPS-data finns men inget kluster bildades
  | 'filtered_as_too_short'     // Vistelsen klassades som micro/short_stop
  | 'swallowed_by_travel'       // Annan resa täcker tidsfönstret
  | 'target_unknown'            // Plats okänd (ingen knownSiteId, ingen geocode)
  | 'merged_into_previous'      // Slogs ihop med föregående block
  | 'raw_only_only'             // Endast raw-events (timer/assistant/server) — inget block
  | 'no_signal';                // Tomt fönster — varken GPS eller timer

export interface PresenceBlock {
  kind: 'presence';
  id: string;
  /** ISO start och slut. endIso=null om vistelsen pågår. */
  startIso: string;
  endIso: string | null;
  durationMin: number;
  /** placeKey från source-eventet (när det finns). */
  placeKey: string | null;
  /** Visningsetikett. */
  title: string;
  /** Sekundär rad — adress eller bookingnamn. */
  subtitle: string | null;
  /** Är det ett projekt/booking/large_project? */
  isProject: boolean;
  /** Stark/möjlig/kort/projekt — styr visuell vikt. */
  strength: PresenceStrength;
  /** Om en short_stop som behöver granskning. */
  requiresReview: boolean;
  /** Pågår vistelsen fortfarande (ingen departure)? */
  ongoing: boolean;
  /** Senaste ping inom vistelsen. */
  lastPingIso: string | null;
  /** Eventid som BYGGDE blocket (huvud-event). */
  sourceEventIds: string[];
  /** Tekniska events som mergeats in (raw_events i expand). */
  innerEvents: ActualEvent[];
  /** Timer-info om någon timer/LTE överlappade. */
  timer: {
    startedIso: string | null;
    stoppedIso: string | null;
    active: boolean;
    present: boolean;
  };
  /** Bevisflaggor — vilka källor stödjer detta arbetsblock. */
  sources: {
    timeReport: boolean;
    timer: boolean;
    gpsVisit: boolean;
    assistant: boolean;
  };
  /** Mänsklig sammanfattning av sources, t.ex. "Tidrapport + GPS". */
  evidenceLabel: string | null;
  /** 'high' om TR + (timer eller gps), 'medium' annars. */
  confidence: 'high' | 'medium' | 'low';
}

export interface JourneyBlock {
  kind: 'journey';
  id: string;
  startIso: string;
  endIso: string;
  durationMin: number;
  fromLabel: string | null;
  toLabel: string | null;
  fromPlaceKey: string | null;
  toPlaceKey: string | null;
  /** Om båda endpoints är arbetsplatser (annars osäker). */
  bothKnown: boolean;
  uncertain: boolean;
  sourceEventIds: string[];
  innerEvents: ActualEvent[];
}

export interface GapBlock {
  kind: 'gap';
  id: string;
  startIso: string;
  endIso: string;
  durationMin: number;
  /** Var skulle blocket varit? (label från endpoints). */
  expectedLabel: string | null;
  /** Diagnostisk anledning. */
  reason: GapReason;
  /** Mänskligt förklarande text. */
  explanation: string;
  /** Raw-events som täcker fönstret men inte blev block. */
  innerEvents: ActualEvent[];
}

export type DayBlock = PresenceBlock | JourneyBlock | GapBlock;

export interface BuildBlockTimelineInput {
  /** mainTimeline-events från classifyTimelineCoalesced (visibility=main). */
  mainEvents: ActualEvent[];
  /** Alla råa events (inkl raw_only) — används för att hitta mergeable detaljer. */
  allEvents: ActualEvent[];
  /** Indexerad på placeKey för label/duration-konsistens. */
  visitByKey: Map<string, { knownSiteId: string | null; label: string; durationMin: number; end: string }>;
}

const META = (ev: ActualEvent): Record<string, unknown> => (ev.meta ?? {}) as Record<string, unknown>;

const placeKeyOf = (ev: ActualEvent): string | null => {
  const k = META(ev).placeKey;
  return typeof k === 'string' ? k : null;
};

const isPresenceEvent = (ev: ActualEvent): boolean =>
  ev.kind === 'gps_visit'
  || ev.kind === 'gps_arrival'
  || (ev.kind as string) === 'time_report_active'
  || (ev.kind as string) === 'time_report_window';

const isJourneyEvent = (ev: ActualEvent): boolean =>
  ev.kind === 'gps_travel';

const isInnerTechnical = (ev: ActualEvent): boolean =>
  ev.kind === 'gps_arrival'
  || ev.kind === 'gps_departure'
  || ev.kind === 'timer_started'
  || ev.kind === 'timer_stopped'
  || ev.kind === 'assistant_arrival'
  || ev.kind === 'assistant_departure'
  || ev.kind === 'assistant_other'
  || (ev.kind as string).startsWith('time_report')
  || (ev.kind as string).startsWith('server_');

const strengthFromMeta = (ev: ActualEvent, fallbackMin: number): PresenceStrength => {
  const m = META(ev);
  const s = m.stopStrength;
  if (s === 'strong_visit' || s === 'possible_visit' || s === 'short_stop' || s === 'project') return s;
  if (fallbackMin >= 30) return 'strong_visit';
  if (fallbackMin >= 15) return 'possible_visit';
  return 'short_stop';
};

export function buildDayBlockTimeline(input: BuildBlockTimelineInput): DayBlock[] {
  const { mainEvents, allEvents, visitByKey } = input;

  // 1) Bygg presence/journey kärnor (chronologiskt)
  const sortedMain = [...mainEvents].sort((a, b) => a.at.localeCompare(b.at));
  const blocks: DayBlock[] = [];

  for (const ev of sortedMain) {
    if (isPresenceEvent(ev)) {
      const m = META(ev);
      const pk = placeKeyOf(ev);
      const visit = pk ? visitByKey.get(pk) : undefined;
      const knownSiteId = visit?.knownSiteId ?? null;
      const isProject = !!knownSiteId
        && (knownSiteId.startsWith('booking:') || knownSiteId.startsWith('large:'));
      const ongoing = m.ongoing === true;
      const startIso = ev.at;
      const endIso = ongoing ? null : (ev.until ?? visit?.end ?? null);
      const durationMin = ev.durationMin ?? visit?.durationMin ?? 0;
      const requiresReview = m.requires_review === true || m.shortStopPromoted === true;
      const strength: PresenceStrength = isProject
        ? 'project'
        : strengthFromMeta(ev, durationMin);
      const block: PresenceBlock = {
        kind: 'presence',
        id: `pb:${ev.id}`,
        startIso,
        endIso,
        durationMin,
        placeKey: pk,
        title: visit?.label || ev.place || (typeof ev.label === 'string' ? ev.label : 'Plats'),
        subtitle: null,
        isProject,
        strength,
        requiresReview,
        ongoing,
        lastPingIso: (m.visit_last_seen_at as string | undefined) ?? (m.lastPingAt as string | undefined) ?? visit?.end ?? null,
        sourceEventIds: [ev.id],
        innerEvents: [],
        timer: { startedIso: null, stoppedIso: null, active: false, present: false },
      };
      blocks.push(block);
      continue;
    }
    if (isJourneyEvent(ev)) {
      const m = META(ev);
      const labelStr = typeof ev.label === 'string' ? ev.label : '';
      const stripped = labelStr.replace(/^(Förflyttning|Möjlig förflyttning[^:]*|Bakgrunds-GPS[^:]*):\s*/, '');
      const [from, to] = stripped.includes(' → ') ? stripped.split(' → ').map(s => s.trim()) : [null, null];
      const fromKey = (m.fromPlaceKey as string | undefined) ?? null;
      const toKey = (m.toPlaceKey as string | undefined) ?? null;
      const bothKnown = !!m.bothKnown;
      const journey: JourneyBlock = {
        kind: 'journey',
        id: `jb:${ev.id}`,
        startIso: ev.at,
        endIso: ev.until ?? ev.at,
        durationMin: ev.durationMin ?? 0,
        fromLabel: (m.from_label as string | undefined) ?? from ?? null,
        toLabel: (m.to_label as string | undefined) ?? to ?? null,
        fromPlaceKey: fromKey,
        toPlaceKey: toKey,
        bothKnown,
        uncertain: !bothKnown,
        sourceEventIds: [ev.id],
        innerEvents: [],
      };
      blocks.push(journey);
    }
  }

  // 2) Slå samman tekniska events (gps_arrival/departure, timer, assistant,
  //    server, time_report_*) in i närmaste presence/journey-block. Gäller
  //    BÅDE main- och raw_only-events — block äger detaljerna.
  const allSorted = [...allEvents].sort((a, b) => a.at.localeCompare(b.at));
  for (const ev of allSorted) {
    if (!isInnerTechnical(ev)) continue;
    // Skip om eventet redan är källa till ett block
    if (blocks.some(b => b.kind !== 'gap' && b.sourceEventIds.includes(ev.id))) continue;

    const evMs = new Date(ev.at).getTime();
    const evPk = placeKeyOf(ev);

    // Hitta bästa block: presence med samma placeKey som täcker tiden, annars
    // närmaste journey som täcker tiden, annars närmaste block i tiden.
    let target: PresenceBlock | JourneyBlock | null = null;
    let bestScore = Infinity;
    for (const b of blocks) {
      if (b.kind === 'gap') continue;
      const startMs = new Date(b.startIso).getTime();
      const endMs = b.kind === 'presence'
        ? (b.endIso ? new Date(b.endIso).getTime() : Number.POSITIVE_INFINITY)
        : new Date(b.endIso).getTime();
      const inside = evMs >= startMs - 60_000 && evMs <= endMs + 60_000;
      const samePlace = b.kind === 'presence' && evPk && evPk === b.placeKey;
      let score: number;
      if (inside && samePlace) score = 0;
      else if (inside) score = 1_000;
      else score = Math.min(Math.abs(evMs - startMs), Math.abs(evMs - endMs)) + 10_000;
      if (score < bestScore) {
        bestScore = score;
        target = b;
      }
    }
    // Om ingen kandidat inom 30 min — släpp event (kommer att synas i raw-vyn ändå)
    if (!target || bestScore > 1_800_000) continue;
    target.innerEvents.push(ev);

    // Uppdatera timer-info på presence-block
    if (target.kind === 'presence') {
      if (ev.kind === 'timer_started') {
        if (!target.timer.startedIso) target.timer.startedIso = ev.at;
        target.timer.present = true;
        target.timer.active = true;
      } else if (ev.kind === 'timer_stopped') {
        target.timer.stoppedIso = ev.at;
        target.timer.present = true;
        target.timer.active = false;
      }
    }
  }

  // 3) Syntetisera presence-block från TIME_REPORT-fönster när ingen vistelse
  //    täcker den tiden. Detta säkerställer att huvudjournalen visar
  //    "FA Warehouse 13:43–22:48" även när GPS-vistelse saknas.
  const trCreated = allSorted.filter(e => e.kind === 'time_report_created');
  const trClosed = allSorted.filter(e => e.kind === 'time_report_closed');
  for (const cr of trCreated) {
    const trIdMatch = cr.id.replace(/^tr-create:/, '');
    const cl = trClosed.find(c => c.id === `tr-close:${trIdMatch}`);
    const startIso = cr.at;
    const endIso = cl?.at ?? null;
    const startMs = new Date(startIso).getTime();
    const endMs = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;
    // Hoppa om presence redan täcker (>=50%) detta fönster
    const covered = blocks.some(b => {
      if (b.kind !== 'presence') return false;
      const bs = new Date(b.startIso).getTime();
      const be = b.endIso ? new Date(b.endIso).getTime() : Number.POSITIVE_INFINITY;
      const overlap = Math.min(be, endMs) - Math.max(bs, startMs);
      const len = (Number.isFinite(endMs) ? endMs : bs + 60_000) - startMs;
      return overlap > 0 && (len <= 0 || overlap / Math.max(len, 1) >= 0.5);
    });
    if (covered) continue;
    const labelRaw = (typeof cr.label === 'string' ? cr.label.replace(/^Tidrapport startad:\s*/, '') : '');
    const label = cr.place ?? labelRaw ?? 'Tidrapport';
    const dur = Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 60_000)) : 0;
    const synthetic: PresenceBlock = {
      kind: 'presence',
      id: `pb:tr:${trIdMatch}`,
      startIso,
      endIso,
      durationMin: dur,
      placeKey: null,
      title: label,
      subtitle: 'från tidrapport (ingen GPS-vistelse)',
      isProject: false,
      strength: 'time_report_window',
      requiresReview: true,
      ongoing: !endIso,
      lastPingIso: null,
      sourceEventIds: [cr.id, ...(cl ? [cl.id] : [])],
      innerEvents: [],
      timer: { startedIso: null, stoppedIso: null, active: !endIso, present: true },
    };
    blocks.push(synthetic);
  }

  // 4) Sortera om kronologiskt
  blocks.sort((a, b) => a.startIso.localeCompare(b.startIso));

  // 5) Mellan två journeys: om destinationen är en KÄND plats (FA Warehouse,
  //    booking, lager, location) — syntetisera en INFERRED presence där
  //    personen rimligen vistades. Annars infoga GAP-markör som förklarar
  //    varför ingen presence gick att skapa.
  const MIN_INFERRED_PRESENCE_MIN = 5;
  const withGaps: DayBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    withGaps.push(cur);
    const next = blocks[i + 1];
    if (!next) continue;
    if (cur.kind !== 'journey' || next.kind !== 'journey') continue;
    const curEndMs = new Date(cur.endIso).getTime();
    const nextStartMs = new Date(next.startIso).getTime();
    const gapMin = Math.round((nextStartMs - curEndMs) / 60_000);
    if (gapMin < 2) continue;

    // Föredra cur.toPlaceKey, fall tillbaka till next.fromPlaceKey
    const expectedKey = cur.toPlaceKey ?? next.fromPlaceKey ?? null;
    const expectedLabel = cur.toLabel ?? next.fromLabel ?? null;
    const visit = expectedKey ? visitByKey.get(expectedKey) : undefined;
    const isKnownSite = !!visit?.knownSiteId
      || !!(expectedKey && (expectedKey.startsWith('booking:') || expectedKey.startsWith('large:') || expectedKey.startsWith('site:') || expectedKey.startsWith('location:')));
    const rawInWindow = allSorted.filter(e => {
      const ms = new Date(e.at).getTime();
      return ms >= curEndMs - 30_000 && ms <= nextStartMs + 30_000;
    });

    // INFERRED PRESENCE — destinationen är känd och fönstret är meningsfullt
    if (gapMin >= MIN_INFERRED_PRESENCE_MIN && expectedLabel && (isKnownSite || expectedKey)) {
      const knownSiteId = visit?.knownSiteId ?? null;
      const isProject = !!knownSiteId
        && (knownSiteId.startsWith('booking:') || knownSiteId.startsWith('large:'));
      withGaps.push({
        kind: 'presence',
        id: `pb:inferred:${cur.id}:${next.id}`,
        startIso: cur.endIso,
        endIso: next.startIso,
        durationMin: gapMin,
        placeKey: expectedKey,
        title: expectedLabel,
        subtitle: isKnownSite ? 'mellan resor (känd plats)' : 'mellan resor',
        isProject,
        strength: isProject ? 'project' : 'inferred_between_journeys',
        requiresReview: !isKnownSite,
        ongoing: false,
        lastPingIso: null,
        sourceEventIds: [],
        innerEvents: rawInWindow,
        timer: { startedIso: null, stoppedIso: null, active: false, present: false },
      });
      continue;
    }

    // Inget vi kan härleda — diagnostisk GAP
    let reason: GapReason;
    let explanation: string;
    if (!expectedLabel) {
      reason = 'target_unknown';
      explanation = 'Förflyttningens destination saknar plats — vistelsen kunde inte härledas.';
    } else if (visit) {
      reason = 'merged_into_previous';
      explanation = `Vistelse på ${expectedLabel} fanns men slogs ihop med annat block.`;
    } else if (rawInWindow.some(e => e.kind === 'gps_visit' || e.kind === 'gps_arrival')) {
      reason = 'filtered_as_too_short';
      explanation = `GPS-stopp på ${expectedLabel} fanns men var för kort (<15 min) för eget block.`;
    } else if (rawInWindow.length > 0) {
      reason = 'raw_only_only';
      explanation = `Endast tekniska/raw-events i fönstret — ingen GPS-vistelse genererades på ${expectedLabel}.`;
    } else {
      reason = 'no_signal';
      explanation = `Ingen GPS-signal mellan resorna — vistelse på ${expectedLabel ?? 'okänd plats'} kan inte bekräftas.`;
    }

    withGaps.push({
      kind: 'gap',
      id: `gap:${cur.id}:${next.id}`,
      startIso: cur.endIso,
      endIso: next.startIso,
      durationMin: gapMin,
      expectedLabel,
      reason,
      explanation,
      innerEvents: rawInWindow,
    });
  }

  // 6) Slå ihop INFERRED-presence med en omslutande TIDRAPPORT-presence:
  //    om en TR-presence täcker hela tiden, låt inferred bli "innesluten"
  //    detalj. Vi gör inget hårt här — TR-blocket finns redan och visas;
  //    inferred-blocket ger mer granularitet mellan resor.

  return withGaps;
}
