// ─────────────────────────────────────────────────────────────────────────────
// evaluateAutoStopForActiveDay
//
// PURE evaluator. Inga DB-anrop. Tar in:
//   • aktiv `active_time_registrations`-rad (dagtimern)
//   • kronologiska work-anchors (LTE-rader för dagen — ENBART som EVIDENCE
//     om var staffen senast var på arbete; vi MUTERAR dem aldrig)
//   • GPS-pings efter sista arbets-ankaret
//   • home / private-zones (lat/lng + radius)
//   • now()
//
// Returnerar ett beslut:
//   • { stop: true,  stopAt, stopSource, metadata }   → caller patchar dagtimern
//   • { stop: false, rejectedReason, metadata }       → caller låter den ticka
//
// Den fattar ALDRIG beslut som påverkar projekt-/booking-/location-tid.
// Den fattar ALDRIG beslut om att skapa time_reports eller LTE.
// Den enda mutation caller får göra är:
//
//   UPDATE active_time_registrations
//      SET status='stopped', stopped_at=<stopAt>, stop_source=<stopSource>,
//          stopped_by='system_day_auto_stop', metadata = metadata || <metadata>
//    WHERE id=<reg.id> AND status='active' AND stopped_at IS NULL;
//
// ─────────────────────────────────────────────────────────────────────────────

export type AutoStopAnchorKind = 'project' | 'large_project' | 'location' | 'booking' | 'warehouse';

export interface AutoStopWorkAnchor {
  /** When the staff member LEFT this work anchor (ISO). null = still inside. */
  exitedAtIso: string | null;
  /** When they entered (informational). */
  enteredAtIso: string;
  kind: AutoStopAnchorKind;
  /** Stable id (location_id, booking_id, project_id …) */
  targetId: string | null;
  /** Human label for diagnostics. */
  label: string | null;
  /** Anchor centre — used to verify staffen är "borta" från det. */
  lat: number | null;
  lng: number | null;
}

export interface AutoStopPing {
  recordedAtIso: string;
  lat: number;
  lng: number;
}

export interface AutoStopHomeZone {
  lat: number;
  lng: number;
  /** Radius i meter. Default 150. */
  radiusM?: number;
  /** 'inferred_home' | 'private_residence' | 'manual_ignore' | 'recurring_night' */
  kind?: string;
}

export interface AutoStopActiveRegistration {
  id: string;
  staffId: string;
  organizationId: string;
  startedAtIso: string;
  status: string;
  stoppedAtIso: string | null;
  startSource: string | null;
}

export interface EvaluateAutoStopInput {
  registration: AutoStopActiveRegistration;
  workAnchors: AutoStopWorkAnchor[];
  pingsAfterLastAnchor: AutoStopPing[];
  homeZones: AutoStopHomeZone[];
  /** ISO. Defaults to new Date().toISOString() */
  nowIso?: string;
  /** Override defaults. */
  config?: Partial<AutoStopConfig>;
}

export interface AutoStopConfig {
  /** Hur länge får dagtimern rulla utan att ny arbets-evidence kommer? Default 90. */
  idleAfterWorkMinutesThreshold: number;
  /** Hur länge måste hemvistelse pågå innan vi stoppar? Default 90. */
  homeDwellMinutesThreshold: number;
  /** Absolut tak — om dagtimern rullat så här länge utan ny work-evidence stoppar vi alltid. Default 18h. */
  hardCapHoursWithoutWork: number;
  /** Hur långt ifrån sista work-anchor staffen måste vara för att räknas som "borta". Default 250m. */
  awayFromWorkAnchorMeters: number;
  /** Skip om sista pingen är inom denna radie från work anchor. Default 250m. */
  stillAtWorkAnchorMeters: number;
  /** Minsta antal pings som krävs efter sista anchor för att vi ska våga ta beslut. Default 3. */
  minPingsForDecision: number;
  /** Max ålder på senaste pingen. Är pingen äldre än så här saknar vi färsk signal → reject. Default 60 min. */
  maxPingAgeMinutes: number;
}

const DEFAULTS: AutoStopConfig = {
  idleAfterWorkMinutesThreshold: 90,
  homeDwellMinutesThreshold: 90,
  hardCapHoursWithoutWork: 18,
  awayFromWorkAnchorMeters: 250,
  stillAtWorkAnchorMeters: 250,
  minPingsForDecision: 3,
  maxPingAgeMinutes: 60,
};

export type AutoStopSource =
  | 'gps_home_auto_stop'
  | 'gps_inactivity_auto_stop'
  | 'gps_left_last_workplace_auto_stop'
  | 'hard_cap_no_work_evidence';

export type AutoStopRejectedReason =
  | 'no_active_registration'
  | 'already_stopped'
  | 'still_inside_work_anchor'
  | 'no_work_anchors_yet'
  | 'too_few_pings'
  | 'last_ping_too_old'
  | 'idle_below_threshold'
  | 'home_dwell_below_threshold'
  | 'no_home_zone_configured'
  | 'no_decision';

export interface AutoStopDiagnostics {
  autoStopEvaluated: true;
  autoStopCreated: boolean;
  stopSource: AutoStopSource | null;
  proposedStopTime: string | null;
  actualStoppedAt: string | null;
  lastWorkAnchor: {
    kind: AutoStopAnchorKind;
    targetId: string | null;
    label: string | null;
    exitedAtIso: string | null;
  } | null;
  homeDetected: boolean;
  privateResidenceDetected: boolean;
  /** True iff the auto-stop decision was driven by home/private dwell. */
  autoStopBecauseHome: boolean;
  idleAfterWorkMinutes: number | null;
  rejectedReason: AutoStopRejectedReason | null;
  configUsed: AutoStopConfig;
}

export type EvaluateAutoStopDecision =
  | {
      stop: true;
      stopAtIso: string;
      stopSource: AutoStopSource;
      diagnostics: AutoStopDiagnostics;
    }
  | {
      stop: false;
      rejectedReason: AutoStopRejectedReason;
      diagnostics: AutoStopDiagnostics;
    };

// ── helpers ─────────────────────────────────────────────────────────────────

function distMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pickLastWorkAnchor(anchors: AutoStopWorkAnchor[]): AutoStopWorkAnchor | null {
  if (!anchors || anchors.length === 0) return null;
  // Senast EXITED — om någon fortfarande är inside (exitedAtIso=null) räknas
  // det som att staffen ÄR på arbetsplats nu och då stoppar vi inte.
  const sorted = [...anchors].sort((a, b) => {
    const ta = a.exitedAtIso ? new Date(a.exitedAtIso).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.exitedAtIso ? new Date(b.exitedAtIso).getTime() : Number.POSITIVE_INFINITY;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

function isInsideHome(p: AutoStopPing, zones: AutoStopHomeZone[]): { hit: boolean; kind: string | null } {
  for (const z of zones || []) {
    const r = Number.isFinite(z.radiusM) ? Number(z.radiusM) : 150;
    const d = distMeters({ lat: p.lat, lng: p.lng }, { lat: z.lat, lng: z.lng });
    if (d <= r) return { hit: true, kind: z.kind ?? 'home' };
  }
  return { hit: false, kind: null };
}

// ── main ────────────────────────────────────────────────────────────────────

export function evaluateAutoStopForActiveDay(
  input: EvaluateAutoStopInput,
): EvaluateAutoStopDecision {
  const cfg: AutoStopConfig = { ...DEFAULTS, ...(input.config || {}) };
  const now = new Date(input.nowIso ?? new Date().toISOString());

  const baseDiag: AutoStopDiagnostics = {
    autoStopEvaluated: true,
    autoStopCreated: false,
    stopSource: null,
    proposedStopTime: null,
    actualStoppedAt: null,
    lastWorkAnchor: null,
    homeDetected: false,
    privateResidenceDetected: false,
    autoStopBecauseHome: false,
    idleAfterWorkMinutes: null,
    rejectedReason: null,
    configUsed: cfg,
  };

  const reg = input.registration;
  if (!reg) {
    return { stop: false, rejectedReason: 'no_active_registration', diagnostics: { ...baseDiag, rejectedReason: 'no_active_registration' } };
  }
  if (reg.status !== 'active' || reg.stoppedAtIso) {
    return { stop: false, rejectedReason: 'already_stopped', diagnostics: { ...baseDiag, rejectedReason: 'already_stopped' } };
  }

  const lastAnchor = pickLastWorkAnchor(input.workAnchors || []);
  if (lastAnchor) {
    baseDiag.lastWorkAnchor = {
      kind: lastAnchor.kind,
      targetId: lastAnchor.targetId,
      label: lastAnchor.label,
      exitedAtIso: lastAnchor.exitedAtIso,
    };
  }

  // Hard guard: still inside a work anchor → ALDRIG stoppa.
  if (lastAnchor && lastAnchor.exitedAtIso === null) {
    return {
      stop: false,
      rejectedReason: 'still_inside_work_anchor',
      diagnostics: { ...baseDiag, rejectedReason: 'still_inside_work_anchor' },
    };
  }

  // Hard cap: dagtimern har rullat orimligt länge utan ANY work anchor.
  const startedMs = new Date(reg.startedAtIso).getTime();
  const ageHours = (now.getTime() - startedMs) / 3_600_000;
  if (!lastAnchor) {
    if (ageHours >= cfg.hardCapHoursWithoutWork) {
      const stopAtIso = new Date(startedMs + cfg.hardCapHoursWithoutWork * 3_600_000).toISOString();
      return {
        stop: true,
        stopAtIso,
        stopSource: 'hard_cap_no_work_evidence',
        diagnostics: {
          ...baseDiag,
          autoStopCreated: true,
          stopSource: 'hard_cap_no_work_evidence',
          proposedStopTime: stopAtIso,
          actualStoppedAt: stopAtIso,
        },
      };
    }
    return { stop: false, rejectedReason: 'no_work_anchors_yet', diagnostics: { ...baseDiag, rejectedReason: 'no_work_anchors_yet' } };
  }

  const lastExitMs = new Date(lastAnchor.exitedAtIso!).getTime();
  const idleMinutes = (now.getTime() - lastExitMs) / 60_000;
  baseDiag.idleAfterWorkMinutes = Math.round(idleMinutes);

  const pings = (input.pingsAfterLastAnchor || []).filter(p => {
    const t = new Date(p.recordedAtIso).getTime();
    return Number.isFinite(t) && t >= lastExitMs && t <= now.getTime();
  });

  // Detect home/private hits across the post-anchor window.
  let firstHomeHitMs: number | null = null;
  let lastHomeKind: string | null = null;
  let lastPingInsideHome = false;
  for (const p of pings) {
    const h = isInsideHome(p, input.homeZones || []);
    if (h.hit) {
      if (firstHomeHitMs === null) firstHomeHitMs = new Date(p.recordedAtIso).getTime();
      lastHomeKind = h.kind;
      lastPingInsideHome = true;
    } else {
      lastPingInsideHome = false;
    }
  }
  if (firstHomeHitMs !== null) {
    baseDiag.homeDetected = true;
    if (lastHomeKind && lastHomeKind !== 'home' && lastHomeKind !== 'inferred_home') {
      baseDiag.privateResidenceDetected = true;
    } else {
      baseDiag.privateResidenceDetected = lastHomeKind === 'private_residence' || baseDiag.privateResidenceDetected;
    }
  }

  // Guard: still at work anchor coords (last ping inside anchor radius) → reject.
  const lastPing = pings.length > 0 ? pings[pings.length - 1] : null;
  if (lastPing && lastAnchor.lat !== null && lastAnchor.lng !== null) {
    const d = distMeters(
      { lat: lastPing.lat, lng: lastPing.lng },
      { lat: lastAnchor.lat, lng: lastAnchor.lng },
    );
    if (d <= cfg.stillAtWorkAnchorMeters) {
      return {
        stop: false,
        rejectedReason: 'still_inside_work_anchor',
        diagnostics: { ...baseDiag, rejectedReason: 'still_inside_work_anchor' },
      };
    }
  }

  // Guard: senaste ping är för gammal → vi har dålig signal, låt watchdog ta det.
  if (lastPing) {
    const ageMin = (now.getTime() - new Date(lastPing.recordedAtIso).getTime()) / 60_000;
    if (ageMin > cfg.maxPingAgeMinutes) {
      return {
        stop: false,
        rejectedReason: 'last_ping_too_old',
        diagnostics: { ...baseDiag, rejectedReason: 'last_ping_too_old' },
      };
    }
  }

  // ── Scenario 1: HEMMA längre än threshold ──
  if (firstHomeHitMs !== null && lastPingInsideHome) {
    const dwellMin = (now.getTime() - firstHomeHitMs) / 60_000;
    if (dwellMin >= cfg.homeDwellMinutesThreshold) {
      // Backdate: stop = max(lastAnchor.exitedAt, firstHomeHit). Vi väljer
      // firstHomeHit ENDAST om det är efter sista work-exit; annars är
      // sista work-exit "rimligast" eftersom personen kan ha varit hemma
      // över hela dagen och bara gjort ett kort jobb.
      const stopMs = Math.max(lastExitMs, firstHomeHitMs);
      const stopAtIso = new Date(stopMs).toISOString();
      return {
        stop: true,
        stopAtIso,
        stopSource: 'gps_home_auto_stop',
        diagnostics: {
          ...baseDiag,
          autoStopCreated: true,
          stopSource: 'gps_home_auto_stop',
          proposedStopTime: new Date(firstHomeHitMs).toISOString(),
          actualStoppedAt: stopAtIso,
          autoStopBecauseHome: true,
        },
      };
    }
    // Hem upptäckt men dwell < threshold → vänta.
    return {
      stop: false,
      rejectedReason: 'home_dwell_below_threshold',
      diagnostics: { ...baseDiag, rejectedReason: 'home_dwell_below_threshold' },
    };
  }

  // ── Scenario 2: ingen ny arbets-evidence på N minuter sedan sista exit ──
  // Kräver minst minPingsForDecision pings för att vi ska kunna säga något,
  // ELLER att idle-tiden överskrider 2× threshold (då litar vi på exit-tiden ensam).
  if (idleMinutes >= cfg.idleAfterWorkMinutesThreshold) {
    if (pings.length >= cfg.minPingsForDecision || idleMinutes >= cfg.idleAfterWorkMinutesThreshold * 2) {
      const stopAtIso = new Date(lastExitMs).toISOString();
      const stopSource: AutoStopSource =
        pings.length === 0 ? 'gps_inactivity_auto_stop' : 'gps_left_last_workplace_auto_stop';
      return {
        stop: true,
        stopAtIso,
        stopSource,
        diagnostics: {
          ...baseDiag,
          autoStopCreated: true,
          stopSource,
          proposedStopTime: stopAtIso,
          actualStoppedAt: stopAtIso,
        },
      };
    }
    return {
      stop: false,
      rejectedReason: 'too_few_pings',
      diagnostics: { ...baseDiag, rejectedReason: 'too_few_pings' },
    };
  }

  return {
    stop: false,
    rejectedReason: 'idle_below_threshold',
    diagnostics: { ...baseDiag, rejectedReason: 'idle_below_threshold' },
  };
}
