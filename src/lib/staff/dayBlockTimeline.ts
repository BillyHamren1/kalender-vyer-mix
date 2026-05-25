/**
 * Day Block Timeline — ENSAM KÄLLA för huvudjournalens block
 * ──────────────────────────────────────────────────────────
 * ANSVAR:
 *   - dayBlockTimeline.ts → kompakt huvudjournal (presence/journey/gap-block)
 *   - timelineVisibility.ts → ENBART råvy / "Visa alla händelser" / hidden_reason
 *
 * Block-vyn får ALDRIG bero på:
 *   - mainTimeline() / classifyTimelineCoalesced()
 *   - short_stop_promotion eller journey-merge i timelineVisibility
 *
 * Input för huvudjournalen: model.actualVisits + model.actualEvents (rå).
 * Output: BlockTimeline[] (presence | journey | gap).
 */

import type { ActualEvent, ActualVisit } from '@/lib/staff/actualStaffDayModel';

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

/** Diskriminator för huvudradtyp i UI: ProjectBlock / LocationBlock / UnknownBlock. */
export type PresenceKind = 'project' | 'location' | 'unknown';

/**
 * Status för platsupplösning. Styr hur UI ska rendera label:
 *  - matched_internal  → intern plats/projekt — använd label rakt av
 *  - pending_geocode   → okänd plats med koordinater — visa "Slår upp adress…"
 *                        tills reverse geocode lagts in
 *  - unknown_no_coords → varken intern match eller koordinater
 */
export type PlaceLookupStatus = 'matched_internal' | 'pending_geocode' | 'unknown_no_coords';

export interface ResolvedPlace {
  label: string;
  lat: number | null;
  lng: number | null;
  /** Google Maps-url från lat/lng om koordinater finns. */
  mapUrl: string | null;
  lookupStatus: PlaceLookupStatus;
  /** Endast satt för okända platser. */
  nearestKnownSite?: ActualVisit['nearestKnownSite'] | null;
  unmatchReason?: string | null;
  /** Diagnostik (sätts av enrichment i ActualDayPanel). */
  lookupError?: string | null;
  pingCount?: number | null;
  avgAccuracy?: number | null;
}

export interface JourneyEndpointPlace {
  label: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
  lookupStatus: PlaceLookupStatus;
  /** Diagnostik (sätts av enrichment i ActualDayPanel). */
  lookupError?: string | null;
  nearestKnownSite?: ActualVisit['nearestKnownSite'] | null;
  unmatchReason?: string | null;
  pingCount?: number | null;
  avgAccuracy?: number | null;
}

export interface PresenceBlock {
  kind: 'presence';
  /** Huvudradtyp för UI-rendering. ProjectBlock har högre visuell vikt. */
  presenceKind: PresenceKind;
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
  /** Är det ett projekt/booking/large_project? (alias för presenceKind === 'project'). */
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
  /** Tidrapport-fönster (om tidrapport finns). */
  timeReport: {
    startedIso: string | null;
    closedIso: string | null;
    present: boolean;
  };
  /** GPS arrival/departure-tider (för subtitle). */
  arrivalIso: string | null;
  departureIso: string | null;
  /** Planerad starttid (om känd via planning). */
  plannedStartIso: string | null;
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
  /** Upplöst plats för rendering — UI ska föredra detta över `title`. */
  resolvedPlace: ResolvedPlace;
  /** Original visit-start innan clipping till workday/timer/TR-context. */
  clippedFromIso?: string | null;
  /** Anledning till clipping. */
  clippedReason?: 'clipped_to_work_context_start' | null;
  /**
   * Canonical workday-policy status (see src/lib/staff/workdayPolicy.ts).
   * UI ska föredra detta för label/färg över heuristik på presenceKind.
   */
  policyStatus?: import('./workdayPolicy').PolicyStatus;
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
  /** Upplöst from-endpoint för rendering — UI ska föredra detta över `fromLabel`. */
  fromPlace: JourneyEndpointPlace;
  /** Upplöst to-endpoint för rendering — UI ska föredra detta över `toLabel`. */
  toPlace: JourneyEndpointPlace;
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
  /**
   * mainTimeline-events från classifyTimelineCoalesced (visibility=main).
   * @deprecated Behålls för bakåtkompatibilitet — block byggs primärt från
   * `actualVisits` + `allEvents`. Om `actualVisits` är tom faller vi tillbaka
   * på presence-events i mainEvents (legacy).
   */
  mainEvents?: ActualEvent[];
  /** Alla råa events (inkl raw_only) — används för journeys + tekniska detaljer. */
  allEvents: ActualEvent[];
  /**
   * Faktiska GPS-vistelser (från pingPlaceSegments). Förstahandskälla för
   * presence-block — får INTE filtreras via timelineVisibility innan.
   */
  actualVisits?: ActualVisit[];
  /** Indexerad på placeKey för label/duration-konsistens + lat/lng för okända block och journey endpoints. */
  visitByKey: Map<string, VisitInfo>;
  /**
   * ISO för när "arbetsdagen/arbetskontexten" börjar (workday.started_at
   * eller första timer/time_report-start om workday saknas). Visits som
   * börjar före denna tid får sin block-start KLIPPT till denna tid när
   * arbetsrelevansen kommer från overlap (workday/timer/TR), så
   * huvudjournalen inte visar 00:00–07:00 som arbetsblock när workday
   * startade 05:47. Original visit-start sparas i `clippedFromIso`.
   */
  workContextStartIso?: string | null;
}

/**
 * Information om en GPS-vistelse, indexerad på placeKey.
 * Speglar fälten från ActualVisit som blockmotorn behöver veta —
 * inkl. centre/coords så att okända presenceBlocks och journey
 * endpoints kan visa lat/lng och utvärdera närhet.
 */
export interface VisitInfo {
  knownSiteId: string | null;
  label: string;
  durationMin: number;
  end: string;
  centre?: { lat: number; lng: number } | null;
  nearestKnownSite?: ActualVisit['nearestKnownSite'] | null;
  unmatchReason?: string | null;
  pingCount?: number;
  avgAccuracy?: number | null;
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

const mapUrlOf = (lat: number | null | undefined, lng: number | null | undefined): string | null =>
  (lat != null && lng != null) ? `https://www.google.com/maps?q=${lat},${lng}` : null;

const PENDING_GEOCODE_LABEL = 'Slår upp adress…';

/**
 * Resolve a presence-block's place from a VisitInfo + presenceKind.
 * - matched_internal → använd label rakt av (intern plats/projekt)
 * - pending_geocode  → koordinater finns men ingen intern match → "Slår upp adress…"
 * - unknown_no_coords → varken match eller koordinater
 */
const resolvePresencePlace = (
  presenceKind: PresenceKind,
  visit: VisitInfo | undefined,
  fallbackLabel: string,
): ResolvedPlace => {
  const lat = visit?.centre?.lat ?? null;
  const lng = visit?.centre?.lng ?? null;
  const mapUrl = mapUrlOf(lat, lng);
  if (presenceKind !== 'unknown' && (visit?.knownSiteId || fallbackLabel)) {
    return {
      label: visit?.label || fallbackLabel,
      lat, lng, mapUrl,
      lookupStatus: 'matched_internal',
    };
  }
  if (lat != null && lng != null) {
    return {
      label: PENDING_GEOCODE_LABEL,
      lat, lng, mapUrl,
      lookupStatus: 'pending_geocode',
      nearestKnownSite: visit?.nearestKnownSite ?? null,
      unmatchReason: visit?.unmatchReason ?? null,
      pingCount: visit?.pingCount ?? null,
      avgAccuracy: visit?.avgAccuracy ?? null,
    };
  }
  return {
    label: fallbackLabel || 'Okänd plats',
    lat: null, lng: null, mapUrl: null,
    lookupStatus: 'unknown_no_coords',
    nearestKnownSite: visit?.nearestKnownSite ?? null,
    unmatchReason: visit?.unmatchReason ?? null,
    pingCount: visit?.pingCount ?? null,
    avgAccuracy: visit?.avgAccuracy ?? null,
  };
};

const resolveJourneyEndpoint = (
  placeKey: string | null,
  fallbackLabel: string | null,
  visitByKey: Map<string, VisitInfo>,
): JourneyEndpointPlace => {
  const visit = placeKey ? visitByKey.get(placeKey) : undefined;
  const lat = visit?.centre?.lat ?? null;
  const lng = visit?.centre?.lng ?? null;
  const mapUrl = mapUrlOf(lat, lng);
  const isInternal = !!visit?.knownSiteId
    || !!(placeKey && (placeKey.startsWith('booking:') || placeKey.startsWith('large:')
      || placeKey.startsWith('site:') || placeKey.startsWith('location:') || placeKey.startsWith('loc:') || placeKey.startsWith('warehouse:')));
  if (isInternal && (visit?.label || fallbackLabel)) {
    return { label: visit?.label || fallbackLabel || 'Plats', lat, lng, mapUrl, lookupStatus: 'matched_internal' };
  }
  if (lat != null && lng != null) {
    return {
      label: PENDING_GEOCODE_LABEL,
      lat, lng, mapUrl,
      lookupStatus: 'pending_geocode',
      nearestKnownSite: visit?.nearestKnownSite ?? null,
      unmatchReason: visit?.unmatchReason ?? null,
      pingCount: visit?.pingCount ?? null,
      avgAccuracy: visit?.avgAccuracy ?? null,
    };
  }
  return {
    label: fallbackLabel || 'Okänd plats',
    lat: null, lng: null, mapUrl: null,
    lookupStatus: 'unknown_no_coords',
    nearestKnownSite: visit?.nearestKnownSite ?? null,
    unmatchReason: visit?.unmatchReason ?? null,
    pingCount: visit?.pingCount ?? null,
    avgAccuracy: visit?.avgAccuracy ?? null,
  };
};


const strengthFromMeta = (ev: ActualEvent, fallbackMin: number): PresenceStrength => {
  const m = META(ev);
  const s = m.stopStrength;
  if (s === 'strong_visit' || s === 'possible_visit' || s === 'short_stop' || s === 'project') return s;
  if (fallbackMin >= 30) return 'strong_visit';
  if (fallbackMin >= 15) return 'possible_visit';
  return 'short_stop';
};

export function buildDayBlockTimeline(input: BuildBlockTimelineInput): DayBlock[] {
  const { mainEvents = [], allEvents, visitByKey, actualVisits = [], workContextStartIso = null } = input;
  const workCtxMs = workContextStartIso ? new Date(workContextStartIso).getTime() : null;

  const blocks: DayBlock[] = [];
  const consumedEventIds = new Set<string>();

  // 1a) PRIMÄR KÄLLA: actualVisits → presence-block. timelineVisibility får
  //     ALDRIG vara gatekeeper här. En faktisk vistelse får inte försvinna
  //     bara för att ett gps_travel-event finns.
  //
  //     Klassificering enligt knownSiteId:
  //       booking:* / large:*               → ProjectBlock
  //       location:* / site:* / warehouse:* → LocationBlock
  //       null + duration ≥ 15 min          → UnknownPresence (review)
  //       null + duration < 15 min          → SKIP (raw_only/debug)
  const MIN_UNKNOWN_REVIEW_MIN = 15;
  for (const v of actualVisits) {
    const knownSiteId = v.knownSiteId;
    const durationMin = v.durationMin ?? 0;
    const isProject = !!knownSiteId
      && (knownSiteId.startsWith('booking:') || knownSiteId.startsWith('large:'));
    const isLocation = !!knownSiteId
      && (knownSiteId.startsWith('location:') || knownSiteId.startsWith('loc:') || knownSiteId.startsWith('site:') || knownSiteId.startsWith('warehouse:'));
    const isKnown = isProject || isLocation;

    // Workday-policy: en okänd vistelse INOM en pågående arbetsdag får
    // ALDRIG silently försvinna — den ska visas som "behöver granskning"
    // och räknas inom arbetsdagen. Endast okända vistelser UTANFÖR
    // arbetsdagskontexten (eller helt utan kontext) filtreras bort som
    // raw/debug när de är för korta.
    const visitStartMsForPolicy = new Date(v.start).getTime();
    const visitEndMsForPolicy = new Date(v.end).getTime();
    const overlapsWorkday = workCtxMs != null
      && Number.isFinite(visitEndMsForPolicy)
      && visitEndMsForPolicy > workCtxMs;

    // Okänd + för kort + utanför arbetsdag → tillhör raw/debug.
    if (!isKnown && durationMin < MIN_UNKNOWN_REVIEW_MIN && !overlapsWorkday) continue;

    // Dagen har inte startat (ingen workday, ingen timer, ingen TR).
    // Då ska huvudjournalen vara tom — en okänd GPS-vistelse får inte
    // starta arbetsdagen automatiskt. Användaren ser den i råvyn.
    if (workCtxMs == null) continue;

    // Visit slutar innan dagen ens började → hör inte hemma i huvudjournalen.
    const visitEndMsEarly = visitEndMsForPolicy;
    if (Number.isFinite(visitEndMsEarly) && visitEndMsEarly <= workCtxMs) continue;



    const presenceKind: PresenceKind = isProject ? 'project' : isLocation ? 'location' : 'unknown';

    // Klipp visit-start vid arbetskontextens start om visit börjar tidigare.
    // Detta hindrar t.ex. ett 00:00–07:00 GPS-kluster på FA Warehouse från
    // att visas som arbetsblock 00:00–07:00 när workday/timer/TR först
    // började 05:47. Vi behåller original-starttiden i clippedFromIso för
    // raw-vy/debug.
    const visitStartMs = new Date(v.start).getTime();
    const visitEndMs = new Date(v.end).getTime();
    let blockStartIso = v.start;
    let blockDurationMin = durationMin;
    let clippedFromIso: string | null = null;
    let clippedReason: 'clipped_to_work_context_start' | null = null;
    if (workCtxMs != null
      && visitStartMs < workCtxMs
      && visitEndMs > workCtxMs) {
      clippedFromIso = v.start;
      clippedReason = 'clipped_to_work_context_start';
      blockStartIso = workContextStartIso!;
      blockDurationMin = Math.max(0, Math.round((visitEndMs - workCtxMs) / 60_000));
    }

    const strength: PresenceStrength = isProject
      ? 'project'
      : blockDurationMin >= 30 ? 'strong_visit'
      : blockDurationMin >= 15 ? 'possible_visit'
      : 'short_stop';
    // Adress är "känd" så snart vi har koordinater eller ett nearestKnownSite.
    // I så fall är det INTE platsen som är okänd — det är vilket projekt
    // platsen tillhör. Visa "Okänt projekt – sparas som övrigt" och ge
    // hint om närmsta projekt (utan att binda timern till det).
    //
    // Tre fall:
    //   - 1 kandidat inom 150 m, autoLoginEligible → "Trolig: X (m)"
    //   - 1 kandidat inom 150 m, utanför ±2d-fönster → "Närmsta: X (m) – ej aktivt"
    //   - flera kandidater inom 150 m → "Flera projekt på adressen – välj projekt"
    //   - ingen kandidat inom 150 m → "Okänt projekt – sparas som övrigt"
    const hasCoords = v.centre != null;
    const vAny = v as unknown as {
      nearestKnownSite?: { name: string; distanceMeters: number; autoLoginEligible?: boolean; activeWindowLabel?: string | null } | null;
      candidatesWithinRadius?: Array<{ id: string; name: string; distanceMeters: number; autoLoginEligible?: boolean; activeWindowLabel?: string | null }>;
    };
    const nearest = vAny.nearestKnownSite ?? null;
    const candidates = vAny.candidatesWithinRadius ?? [];
    // Kort, enhetlig subtitle. Detaljer (närmsta/kandidater) lever i expand-vyn
    // via resolvedPlace.nearestKnownSite så att alla okända rader ser likadana ut.
    let unknownSubtitle: string | null = null;
    if (presenceKind === 'unknown') {
      if (hasCoords || nearest || candidates.length > 0) {
        unknownSubtitle = 'Okänt projekt – sparas som övrigt';
      } else {
        unknownSubtitle = 'Okänd plats';
      }
    }

    blocks.push({
      kind: 'presence',
      presenceKind,
      id: `pb:visit:${v.key}:${blockStartIso}`,
      startIso: blockStartIso,
      endIso: v.end,
      durationMin: blockDurationMin,
      placeKey: v.key,
      title: v.label,
      subtitle: unknownSubtitle,
      isProject,
      strength,
      requiresReview: presenceKind === 'unknown',
      ongoing: false,
      lastPingIso: v.end,
      sourceEventIds: [],
      innerEvents: [],
      timer: { startedIso: null, stoppedIso: null, active: false, present: false },
      timeReport: { startedIso: null, closedIso: null, present: false },
      arrivalIso: blockStartIso,
      departureIso: v.end,
      plannedStartIso: null,
      sources: { timeReport: false, timer: false, gpsVisit: true, assistant: false },
      evidenceLabel: null,
      confidence: 'low',
      resolvedPlace: resolvePresencePlace(presenceKind, v as unknown as VisitInfo, v.label),
      clippedFromIso,
      clippedReason,
      policyStatus: presenceKind === 'project'
        ? 'confirmed_work'
        : presenceKind === 'location'
        ? 'confirmed_work'
        : overlapsWorkday
        ? 'other_place'
        : 'unknown_needs_review',
    });

  }

  // 1b) FALLBACK: om inga actualVisits, använd presence-events från mainEvents
  //     (legacy-väg, kvar för bakåtkompatibilitet med tester/anrop som inte
  //     skickar actualVisits).
  if (actualVisits.length === 0) {
    const sortedMain = [...mainEvents].sort((a, b) => a.at.localeCompare(b.at));
    for (const ev of sortedMain) {
      if (!isPresenceEvent(ev)) continue;
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
      blocks.push({
        kind: 'presence',
        presenceKind: isProject ? 'project' : 'location',
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
        timeReport: { startedIso: null, closedIso: null, present: false },
        arrivalIso: ev.kind === 'gps_arrival' ? ev.at : null,
        departureIso: null,
        plannedStartIso: (m.plannedStartIso as string | undefined) ?? (m.planned_start as string | undefined) ?? null,
        sources: { timeReport: false, timer: false, gpsVisit: ev.kind === 'gps_visit' || ev.kind === 'gps_arrival', assistant: false },
        evidenceLabel: null,
        confidence: 'low',
        resolvedPlace: resolvePresencePlace(
          isProject ? 'project' : 'location',
          visit,
          visit?.label || ev.place || (typeof ev.label === 'string' ? ev.label : 'Plats'),
        ),
      });
      consumedEventIds.add(ev.id);
    }
  }

  // 2) JOURNEYS från ALLA events (inte filtrerade) — gps_travel är alltid main
  //    men vi går via allEvents så vi inte är beroende av buildMainTimeline.
  //
  //    REGEL (Steg 5): JourneyBlock får ENDAST skapas mellan två presenceBlocks.
  //    Förbjudna fall (släpps från huvudjournalen, lever kvar i råvyn):
  //      - samma plats (FA Warehouse → FA Warehouse / samePlaceTravel)
  //      - privat/bakgrund/pre-workday lead-in (nattlig första GPS)
  //      - saknad destination-presence (resa utan toBlock)
  //      - duration < 1 min eller orimligt lång (>8h)
  //    Resor som ersätter en faktisk vistelse förbjuds också (presence vinner).
  const sortedAll = [...allEvents].sort((a, b) => a.at.localeCompare(b.at));
  const presenceBlocks = blocks.filter((b): b is PresenceBlock => b.kind === 'presence');
  const findPresenceForJourney = (
    journeyStartMs: number,
    journeyEndMs: number,
    side: 'from' | 'to',
    placeKey: string | null,
  ): PresenceBlock | null => {
    let best: PresenceBlock | null = null;
    let bestDist = Infinity;
    for (const pb of presenceBlocks) {
      const pbStart = new Date(pb.startIso).getTime();
      const pbEnd = pb.endIso ? new Date(pb.endIso).getTime() : Number.POSITIVE_INFINITY;
      const edgeMs = side === 'from' ? pbEnd : pbStart;
      const journeyEdgeMs = side === 'from' ? journeyStartMs : journeyEndMs;
      // Sidesregel: 'from' måste sluta före (eller överlappa) journey-start
      if (side === 'from' && pbStart > journeyStartMs) continue;
      if (side === 'to' && (pb.endIso ? pbEnd < journeyEndMs : false)) continue;
      const placeMatch = !!placeKey && pb.placeKey === placeKey;
      const dist = Math.abs(edgeMs - journeyEdgeMs);
      // PlaceKey-match vinner alltid; annars närmaste inom 30 min
      const score = placeMatch ? dist : dist + 60 * 60_000;
      if (score < bestDist && (placeMatch || dist <= 30 * 60_000)) {
        bestDist = score;
        best = pb;
      }
    }
    return best;
  };

  for (const ev of sortedAll) {
    if (!isJourneyEvent(ev)) continue;
    if (consumedEventIds.has(ev.id)) continue;
    const m = META(ev);

    // Förbud 1: privat/bakgrund/lead-in
    const travelClass = m.travelClass as string | undefined;
    const workRelevance = m.workRelevance as string | undefined;
    const preWorkday = m.preWorkdayLeadIn === true;
    if (travelClass === 'commute_or_background' || workRelevance === 'private_or_background' || preWorkday) {
      continue;
    }

    const fromKey = (m.fromPlaceKey as string | undefined) ?? null;
    const toKey = (m.toPlaceKey as string | undefined) ?? null;

    // Förbud 2: samma plats (FA → FA)
    if (m.samePlaceTravel === true || (fromKey && toKey && fromKey === toKey)) continue;

    const startMs = new Date(ev.at).getTime();
    const endMs = ev.until ? new Date(ev.until).getTime() : startMs;
    const durMin = ev.durationMin ?? Math.round((endMs - startMs) / 60_000);

    // Förbud 3: orimlig duration
    if (durMin < 1 || durMin > 8 * 60) continue;

    // Förbud 4: saknad fromBlock eller toBlock
    const fromBlock = findPresenceForJourney(startMs, endMs, 'from', fromKey);
    const toBlock = findPresenceForJourney(startMs, endMs, 'to', toKey);
    if (!fromBlock || !toBlock) continue;

    // Förbud 5: from och to mappar till samma presenceBlock
    if (fromBlock === toBlock) continue;
    if (fromBlock.placeKey && toBlock.placeKey && fromBlock.placeKey === toBlock.placeKey) continue;
    // Förbud 5b: from och to ligger inom ~80 m (samma adress, olika placeKey).
    // Vanligt vid GPS-jitter mellan två okända kluster på samma plats.
    {
      const fromVisit = fromBlock.placeKey ? visitByKey.get(fromBlock.placeKey) : null;
      const toVisit = toBlock.placeKey ? visitByKey.get(toBlock.placeKey) : null;
      const fc = fromVisit?.centre ?? null;
      const tc = toVisit?.centre ?? null;
      if (fc && tc) {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(tc.lat - fc.lat);
        const dLng = toRad(tc.lng - fc.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fc.lat)) * Math.cos(toRad(tc.lat)) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
        if (dist <= 80) continue;
      }
    }

    const labelStr = typeof ev.label === 'string' ? ev.label : '';
    const stripped = labelStr.replace(/^(Förflyttning|Möjlig förflyttning[^:]*|Bakgrunds-GPS[^:]*):\s*/, '');
    const [from, to] = stripped.includes(' → ') ? stripped.split(' → ').map(s => s.trim()) : [null, null];
    const bothKnown = !!m.bothKnown;
    const fromKeyResolved = fromKey ?? fromBlock.placeKey;
    const toKeyResolved = toKey ?? toBlock.placeKey;
    const fromLabelResolved = (m.from_label as string | undefined) ?? from ?? fromBlock.title ?? null;
    const toLabelResolved = (m.to_label as string | undefined) ?? to ?? toBlock.title ?? null;
    blocks.push({
      kind: 'journey',
      id: `jb:${ev.id}`,
      startIso: ev.at,
      endIso: ev.until ?? ev.at,
      durationMin: durMin,
      fromLabel: fromLabelResolved,
      toLabel: toLabelResolved,
      fromPlaceKey: fromKeyResolved,
      toPlaceKey: toKeyResolved,
      bothKnown,
      uncertain: !bothKnown,
      sourceEventIds: [ev.id],
      innerEvents: [],
      fromPlace: resolveJourneyEndpoint(fromKeyResolved, fromLabelResolved, visitByKey),
      toPlace: resolveJourneyEndpoint(toKeyResolved, toLabelResolved, visitByKey),
    });
    consumedEventIds.add(ev.id);
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
      const distToEdge = Math.min(Math.abs(evMs - startMs), Math.abs(evMs - endMs));
      let score: number;
      if (inside && samePlace) score = 0;
      // placeKey-match: hör hemma här även om tidrapport/timer stängs/öppnas
      // strax efter att GPS-vistelsen slutat (typ time_report_closed 21 min
      // efter departure). Vi tillåter upp till 60 min utanför kanten.
      else if (samePlace && distToEdge <= 60 * 60_000) score = 100 + distToEdge / 60_000;
      else if (inside) score = 1_000;
      else score = distToEdge + 10_000;
      if (score < bestScore) {
        bestScore = score;
        target = b;
      }
    }
    // Om ingen kandidat inom 30 min — släpp event (kommer att synas i raw-vyn ändå)
    if (!target || bestScore > 1_800_000) continue;
    target.innerEvents.push(ev);

    // Uppdatera timer/time_report/arrival-info på presence-block
    if (target.kind === 'presence') {
      if (ev.kind === 'timer_started') {
        if (!target.timer.startedIso) target.timer.startedIso = ev.at;
        target.timer.present = true;
        target.timer.active = true;
      } else if (ev.kind === 'timer_stopped') {
        target.timer.stoppedIso = ev.at;
        target.timer.present = true;
        target.timer.active = false;
      } else if (ev.kind === 'time_report_created') {
        target.timeReport.startedIso = ev.at;
        target.timeReport.present = true;
      } else if (ev.kind === 'time_report_closed') {
        target.timeReport.closedIso = ev.at;
        target.timeReport.present = true;
      } else if (ev.kind === 'gps_arrival' || ev.kind === 'assistant_arrival') {
        if (!target.arrivalIso || ev.at < target.arrivalIso) target.arrivalIso = ev.at;
      } else if (ev.kind === 'gps_departure' || ev.kind === 'assistant_departure') {
        if (!target.departureIso || ev.at > target.departureIso) target.departureIso = ev.at;
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
      presenceKind: 'location',
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
      timeReport: { startedIso: startIso, closedIso: endIso, present: true },
      arrivalIso: null,
      departureIso: null,
      plannedStartIso: null,
      sources: { timeReport: true, timer: false, gpsVisit: false, assistant: false },
      evidenceLabel: null,
      confidence: 'medium',
      resolvedPlace: { label, lat: null, lng: null, mapUrl: null, lookupStatus: 'matched_internal' },
    };
    blocks.push(synthetic);
  }

  // 4) Sortera om kronologiskt
  blocks.sort((a, b) => a.startIso.localeCompare(b.startIso));

  // 5) Mellan två journeys: inferred_between_journeys är FALLBACK, inte default.
  //    Vi får ALDRIG skapa en falsk arbetsvistelse bara för att två förflyttningar
  //    råkar dela endpoint. Skapa inferred presence ENDAST om:
  //      A) det finns starkt stöd i fönstret (time_report/LTE/timer/assistant/server), ELLER
  //      B) knownSiteId är tydligt OCH gapet är långt (≥30 min)
  //    Annars infogas en diagnostisk GAP. requiresReview=true sätts alltid när
  //    blocket saknar GPS/timer/time_report-bevis.
  const MIN_INFERRED_PRESENCE_MIN = 5;
  const MIN_INFERRED_KNOWN_SITE_MIN = 30; // krav för "B"-fallet utan tekniska bevis
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

    const expectedKey = cur.toPlaceKey ?? next.fromPlaceKey ?? null;
    const expectedLabel = cur.toLabel ?? next.fromLabel ?? null;
    const visit = expectedKey ? visitByKey.get(expectedKey) : undefined;
    const knownSiteId = visit?.knownSiteId ?? null;
    const isKnownSite = !!knownSiteId
      || !!(expectedKey && (expectedKey.startsWith('booking:') || expectedKey.startsWith('large:') || expectedKey.startsWith('site:') || expectedKey.startsWith('location:') || expectedKey.startsWith('loc:') || expectedKey.startsWith('warehouse:')));
    const isProject = !!knownSiteId
      && (knownSiteId.startsWith('booking:') || knownSiteId.startsWith('large:'));

    const rawInWindow = allSorted.filter(e => {
      const ms = new Date(e.at).getTime();
      return ms >= curEndMs - 60_000 && ms <= nextStartMs + 60_000;
    });

    // Starkt stöd = teknisk evidens i fönstret (timer/TR/LTE/assistant/server)
    const hasTimer = rawInWindow.some(e => e.kind === 'timer_started' || e.kind === 'timer_stopped');
    const hasTimeReport = rawInWindow.some(e =>
      e.kind === 'time_report_created'
      || e.kind === 'time_report_closed'
      || (e.kind as string).startsWith('time_report'));
    const hasAssistant = rawInWindow.some(e =>
      e.kind === 'assistant_arrival' || e.kind === 'assistant_departure' || e.kind === 'assistant_other');
    const hasServer = rawInWindow.some(e => (e.kind as string).startsWith('server_'));
    const hasStrongSupport = hasTimer || hasTimeReport || hasAssistant || hasServer;

    // A) starkt stöd → tillåt inferred (även med kort gap ≥5 min)
    // B) knownSite + långt gap → tillåt inferred utan tekniskt stöd
    const allowA = hasStrongSupport && expectedLabel && gapMin >= MIN_INFERRED_PRESENCE_MIN;
    const allowB = isKnownSite && expectedLabel && gapMin >= MIN_INFERRED_KNOWN_SITE_MIN;

    if (allowA || allowB) {
      const sources = {
        timeReport: hasTimeReport,
        timer: hasTimer,
        gpsVisit: false,
        assistant: hasAssistant,
      };
      // requiresReview=true om vi saknar GPS/timer/TR-evidens (assistent/server räknas inte som hård evidens)
      const hasHardEvidence = hasTimer || hasTimeReport;
      withGaps.push({
        kind: 'presence',
        presenceKind: isProject ? 'project' : isKnownSite ? 'location' : 'unknown',
        id: `pb:inferred:${cur.id}:${next.id}`,
        startIso: cur.endIso,
        endIso: next.startIso,
        durationMin: gapMin,
        placeKey: expectedKey,
        title: expectedLabel,
        subtitle: hasHardEvidence
          ? `Härledd vistelse · stöd från ${hasTimeReport ? 'tidrapport' : 'timer'}`
          : 'Härledd mellan resor — kräver granskning',
        isProject,
        strength: isProject ? 'project' : 'inferred_between_journeys',
        requiresReview: !hasHardEvidence,
        ongoing: false,
        lastPingIso: null,
        sourceEventIds: [],
        innerEvents: rawInWindow,
        timer: { startedIso: null, stoppedIso: null, active: false, present: hasTimer },
        timeReport: { startedIso: null, closedIso: null, present: hasTimeReport },
        arrivalIso: null,
        departureIso: null,
        plannedStartIso: null,
        sources,
        evidenceLabel: null,
        confidence: hasHardEvidence ? 'medium' : 'low',
        resolvedPlace: resolvePresencePlace(
          isProject ? 'project' : isKnownSite ? 'location' : 'unknown',
          visit,
          expectedLabel,
        ),
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

  // 6) Beräkna sources/evidenceLabel/confidence för varje presence-block
  //    baserat på vilka tekniska bevis som mergeats in.
  for (const b of withGaps) {
    if (b.kind !== 'presence') continue;
    const hasTr = b.sources.timeReport
      || b.innerEvents.some(e => e.kind === 'time_report_created' || e.kind === 'time_report_closed');
    const hasTimer = b.sources.timer
      || b.timer.present
      || b.innerEvents.some(e => e.kind === 'timer_started' || e.kind === 'timer_stopped' || e.kind === 'timer_end_estimated');
    const hasGps = b.sources.gpsVisit
      || b.innerEvents.some(e => e.kind === 'gps_visit' || e.kind === 'gps_arrival' || e.kind === 'gps_departure');
    const hasAssistant = b.sources.assistant
      || b.innerEvents.some(e => e.kind === 'assistant_arrival' || e.kind === 'assistant_departure' || e.kind === 'assistant_other');
    b.sources = { timeReport: hasTr, timer: hasTimer, gpsVisit: hasGps, assistant: hasAssistant };

    const parts: string[] = [];
    if (hasTr) parts.push('Tidrapport');
    if (hasTimer && !hasTr) parts.push('Timer');
    if (hasGps) parts.push('GPS');
    if (hasAssistant && parts.length === 0) parts.push('Assistent');
    b.evidenceLabel = parts.length > 0 ? parts.join(' + ') : null;

    const evidenceCount = [hasTr, hasTimer, hasGps].filter(Boolean).length;
    b.confidence = evidenceCount >= 2 ? 'high' : evidenceCount === 1 ? 'medium' : 'low';

    // Sätt subtitle om saknas — "Arbete · <evidence>" för kända arbetsplatser
    if (!b.subtitle && b.evidenceLabel) {
      b.subtitle = b.isProject
        ? `Projektarbete · ${b.evidenceLabel}`
        : hasTr || hasTimer
          ? `Arbete · ${b.evidenceLabel}`
          : `Vistelse · ${b.evidenceLabel}`;
    }
  }

  // 7) Konsolidera projekt-aktiva block — undvik "TIMER SAKNAS"-hål.
  //    När en timer/tidrapport är aktiv på ett projekt ska ALLA block för
  //    samma projekt under det fönstret visa timern som närvarande, och
  //    eventuella tomrum mellan dem fyllas med inferred presence-block så
  //    tiden hänger ihop visuellt. Bara det SISTA blocket får timer.active.
  // (timer-tail/timer-bridge är borttagna — ingen "now"-referens behövs här.)
  const projectGroups = new Map<string, PresenceBlock[]>();
  for (const b of withGaps) {
    if (b.kind !== 'presence') continue;
    const isProj = b.isProject || b.presenceKind === 'project';
    // Tidrapport-syntetiska block kan ha presenceKind=location men ändå höra
    // till ett projekt — gruppera på label/placeKey som fallback.
    if (!isProj && !(b.timeReport.present && b.title)) continue;
    const key = b.placeKey ?? (b.title ? `title:${b.title.toLowerCase()}` : null);
    if (!key) continue;
    const arr = projectGroups.get(key) ?? [];
    arr.push(b);
    projectGroups.set(key, arr);
  }

  const consolidated: DayBlock[] = [...withGaps];
  for (const [, group] of projectGroups) {
    group.sort((a, b) => a.startIso.localeCompare(b.startIso));
    const hasActive = group.some(b =>
      b.timer.active
      || b.ongoing
      || (b.timer.startedIso && !b.timer.stoppedIso)
      || (b.timeReport.present && !b.timeReport.closedIso),
    );
    if (!hasActive) continue;
    const earliestStartIso = group.reduce<string>((min, b) => {
      const cand = b.timer.startedIso ?? b.timeReport.startedIso ?? b.startIso;
      return cand < min ? cand : min;
    }, group[0].startIso);

    // BORTTAGET (huvudjournal): syntetiska "timer-bridge" och "timer-tail"-block.
    // Tidigare fyllde vi gap mellan projektsegment och förlängde sista blocket
    // till "nu" som egna presence-rader. Det skapade falska "timer sedan 07:57"-
    // visualiseringar som inte motsvarade riktiga arbetssegment och som
    // konkurrerade med ActiveNowBanner.
    //
    // Aktiv timer visas nu uteslutande via:
    //   - ActiveNowBanner (header.active = öppen time_report/LTE)
    //   - WorkDay-state (header.workday.ongoing)
    //   - activeTimers-providern (mobil)
    // Råspår av timer-events (timer_started/stopped) finns kvar i råvyn
    // ("Visa rådata") oförändrat — inget raderas.
    //
    // Vi behåller bara den lättviktiga spridningen av timer.startedIso/active
    // på de RIKTIGA segmenten (för debug-utskrifter), utan att skapa nya block.
    const last = group[group.length - 1];
    for (const b of group) {
      b.timer.present = true;
      if (b.timer.startedIso == null) b.timer.startedIso = earliestStartIso;
      if (b !== last) {
        b.timer.active = false;
        b.ongoing = false;
        if (b.endIso == null) {
          const idx = group.indexOf(b);
          b.endIso = group[idx + 1].startIso;
        }
      }
    }
    // Sista blocket markeras inte längre som "förlängt till nu" — vi låter
    // dess riktiga endIso stå. ActiveNowBanner äger "pågår nu"-vyn.
  }

  consolidated.sort((a, b) => a.startIso.localeCompare(b.startIso));

  // 8) Same-target sandwich collapse (GPS-drift)
  //    Mönster: presence(A) → [journey|gap|unknown-presence]* → presence(A)
  //    där båda ytter-presence pekar på samma plats (placeKey eller title).
  //    Mittensegmenten = GPS-drift/signaltapp och får inte visas som egna
  //    rader ("Okänd plats" / "Förflyttning"). Vi droppar mittensegmenten,
  //    sväljer deras innerEvents in i första blocket, och förlänger första
  //    blockets endIso till sista blockets endIso.
  const sameTargetKey = (a: PresenceBlock, b: PresenceBlock): string | null => {
    if (a.placeKey && b.placeKey && a.placeKey === b.placeKey) return a.placeKey;
    const at = (a.title ?? '').trim().toLowerCase();
    const bt = (b.title ?? '').trim().toLowerCase();
    if (at && bt && at === bt && a.presenceKind !== 'unknown' && b.presenceKind !== 'unknown') return `title:${at}`;
    return null;
  };
  const collapsed: DayBlock[] = [];
  let ci = 0;
  while (ci < consolidated.length) {
    const cur = consolidated[ci];
    if (cur.kind !== 'presence' || cur.presenceKind === 'unknown') {
      collapsed.push(cur);
      ci++;
      continue;
    }
    let cj = ci + 1;
    let matchIdx = -1;
    while (cj < consolidated.length) {
      const nb = consolidated[cj];
      if (nb.kind === 'presence') {
        if (nb.presenceKind !== 'unknown' && sameTargetKey(cur, nb)) {
          matchIdx = cj;
          break;
        }
        if (nb.presenceKind !== 'unknown') break; // annan känd plats bryter sandwich
      }
      cj++;
    }
    if (matchIdx === -1) {
      collapsed.push(cur);
      ci++;
      continue;
    }
    const next = consolidated[matchIdx] as PresenceBlock;
    const swallowed = consolidated.slice(ci + 1, matchIdx + 1);
    for (const sb of swallowed) {
      if (sb.kind === 'presence' || sb.kind === 'journey') {
        cur.innerEvents = [...cur.innerEvents, ...sb.innerEvents];
      } else if (sb.kind === 'gap') {
        cur.innerEvents = [...cur.innerEvents, ...sb.innerEvents];
      }
    }
    cur.endIso = next.endIso ?? cur.endIso;
    if (cur.endIso) {
      const ms = new Date(cur.endIso).getTime() - new Date(cur.startIso).getTime();
      cur.durationMin = Math.max(cur.durationMin, Math.round(ms / 60_000));
    }
    if (next.timer.active) cur.timer.active = true;
    if (next.timer.stoppedIso) cur.timer.stoppedIso = next.timer.stoppedIso;
    if (next.timeReport.closedIso) cur.timeReport.closedIso = next.timeReport.closedIso;
    cur.ongoing = cur.ongoing || next.ongoing;
    cur.sourceEventIds = [...cur.sourceEventIds, ...next.sourceEventIds];
    collapsed.push(cur);
    ci = matchIdx + 1;
  }

  return collapsed;
}
