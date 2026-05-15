// @ts-nocheck
/**
 * gpsFetchConsistency (Time Engine — Lager 1.10)
 * ───────────────────────────────────────────────
 *
 * Statisk inventering av alla `staff_location_history`-queries i edge
 * functions, klassificerade som:
 *
 *   ok_latest                 — hämtar senaste/aktuella ping(s) för status,
 *                                inte day-wide. Får behålla .limit(N).
 *   must_use_paginated_helper — day-wide / analytics / Time Engine / AI /
 *                                cache / reprocess. SKA gå via
 *                                fetchAllStaffLocationPings.
 *   legacy_review_later       — riskabel att ändra utan separat beslut
 *                                (cron-flöden, historiska 180-dagars
 *                                sökningar, paginerade fallbacks utan
 *                                organization_id). Markeras nu, beslutas
 *                                separat.
 *
 * PRODUKTREGEL: Day-wide GPS-läsning får bara ske via
 * fetchAllStaffLocationPings. Status/latest-queries är OK med .limit(1) eller
 * små .limit(N). Cron/AI/historiska sökningar måste granskas separat innan
 * de bytas — de har egna kontextkrav.
 *
 * Den här filen ändrar INGEN logik. Den är ett kontrakt + diagnostics-källa.
 */

export type GpsQueryClassification =
  | 'ok_latest'
  | 'must_use_paginated_helper'
  | 'legacy_review_later';

export interface GpsQueryEntry {
  file: string;
  /** Function name eller pseudo-namn (inte alltid exakt JS-symbol). */
  functionName: string;
  /** Vad querien används till. */
  queryPurpose: string;
  /** Det numeriska .limit()-värdet, eller null om range/no-limit. */
  limitValue: number | null;
  classification: GpsQueryClassification;
  /** Status efter Lager 1.10 — bytt eller lämnad. */
  status: 'kept' | 'replaced_with_helper' | 'pending_review';
  reason: string;
}

/**
 * Komplett klassificering, baserad på rg-svep 2026-05-15.
 * Test-, doc- och inserts/updates är exkluderade.
 */
export const GPS_FETCH_CONSISTENCY_REPORT: GpsQueryEntry[] = [
  // ── Day-wide / Time Engine — använder redan helpern ─────────────────────
  {
    file: 'supabase/functions/_shared/time-engine/buildDayEvidence.ts',
    functionName: 'buildDayEvidence',
    queryPurpose: 'Day-wide pings → DayGpsEvidence (Time Engine Lager 1)',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 473).',
  },
  {
    file: 'supabase/functions/get-staff-presence-day/index.ts',
    functionName: 'getStaffPresenceDay (own pings)',
    queryPurpose: 'Day-wide pings för presence-day timeline',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 413).',
  },
  {
    file: 'supabase/functions/get-staff-presence-day/index.ts',
    functionName: 'getStaffPresenceDay (peer pings)',
    queryPurpose: 'Peer-pings för companion-route',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 737).',
  },
  {
    file: 'supabase/functions/debug-time-intelligence/index.ts',
    functionName: 'debugTimeIntelligence',
    queryPurpose: 'Day-wide pings för debug/AI-review',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder lokal wrapper kring shared helper.',
  },
  {
    file: 'supabase/functions/analyze-staff-day/index.ts',
    functionName: 'analyzeStaffDay',
    queryPurpose: 'AI day analysis pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 260).',
  },
  {
    file: 'supabase/functions/process-presence-events/index.ts',
    functionName: 'processPresenceEvents',
    queryPurpose: 'Background presence reprocess',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 85).',
  },
  {
    file: 'supabase/functions/backfill-staff-day-report-cache/index.ts',
    functionName: 'backfillStaffDayReportCache',
    queryPurpose: 'Cache backfill day pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 164, 211).',
  },
  {
    file: 'supabase/functions/time-engine-health-check/index.ts',
    functionName: 'timeEngineHealthCheck',
    queryPurpose: 'Health check pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 65).',
  },
  {
    file: 'supabase/functions/get-staff-day-status/index.ts',
    functionName: 'getStaffDayStatus',
    queryPurpose: 'Day status pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 87).',
  },
  {
    file: 'supabase/functions/report-candidate-blocks-health/index.ts',
    functionName: 'reportCandidateBlocksHealth',
    queryPurpose: 'Candidate blocks health pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 530).',
  },
  {
    file: 'supabase/functions/presence-day-blocks-health/index.ts',
    functionName: 'presenceDayBlocksHealth',
    queryPurpose: 'Presence-day health pings',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 224).',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (movement / day pings)',
    queryPurpose: 'Movement + day pings inom mobile-app-api',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason: 'Använder fetchAllStaffLocationPings (rad 9519, 12487).',
  },

  // ── Day-wide queries BYTT i Lager 1.10 ──────────────────────────────────
  {
    file: 'supabase/functions/get-timer-time-segments/index.ts',
    functionName: 'getTimerTimeSegments',
    queryPurpose: 'Bygg tidssegment för aktiv timer (window startedAt→endedAt)',
    limitValue: 2000,
    classification: 'must_use_paginated_helper',
    status: 'replaced_with_helper',
    reason:
      'Lager 1.10: bytt till fetchAllStaffLocationPings — fönstret är timerns hela varaktighet och kan överstiga 2000 pings för långa timers.',
  },

  // ── Day-wide / cron — RISKABEL, lämnad för separat beslut ──────────────
  {
    file: 'supabase/functions/close-stale-workday-entries/index.ts',
    functionName: 'closeStaleWorkdayEntries (since lastExit)',
    queryPurpose: 'Detect long stops sedan senaste geofence-exit',
    limitValue: 500,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'Cron-flöde med risk för regression om datasetet växer. Helpern bör införas tillsammans med en testsvit för stale-detection.',
  },
  {
    file: 'supabase/functions/close-stale-workday-entries/index.ts',
    functionName: 'closeStaleWorkdayEntries (geofence walk)',
    queryPurpose: 'Walk pings från entered_at för att hitta exit-fönster',
    limitValue: 2000,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'Cron, day-wide. Risk för auto-stop-regression. Behöver helper + scenario-test i samma PR.',
  },
  {
    file: 'supabase/functions/process-day-timer-auto-stop/index.ts',
    functionName: 'processDayTimerAutoStop',
    queryPurpose: 'Day-window pings för timer auto-stop',
    limitValue: 500,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'Cron auto-stop. Day-wide men har egen heuristik — behöver scenario-test innan byte.',
  },
  {
    file: 'supabase/functions/workday-ai-auto-stop/index.ts',
    functionName: 'workdayAiAutoStop',
    queryPurpose: 'AI-fönster pings sedan lastActivityEndIso',
    limitValue: 200,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'AI-flöde, fönster sedan senaste aktivitet (kan vara timmar). Day-wide-helper kräver justering om fönstret går utanför dagen.',
  },
  {
    file: 'supabase/functions/_shared/situation-builder.ts',
    functionName: 'buildSituation (recent pings)',
    queryPurpose: 'Recent pings för situation context',
    limitValue: 500,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'Används av flera entrypoints — behöver mappning av since-fönster till start/endUtc innan byte.',
  },
  {
    file: 'supabase/functions/_shared/situation-builder.ts',
    functionName: 'buildSituation (distinct staff)',
    queryPurpose: 'Lista distinct staff_id med ping sedan since',
    limitValue: 2000,
    classification: 'legacy_review_later',
    status: 'pending_review',
    reason:
      'Distinct-listning, inte day-wide tidsserie. Helper är inte rätt verktyg — egen cursor-paginering eller separat RPC bör utvärderas.',
  },
  {
    file: 'supabase/functions/ping-day-pipeline/index.ts',
    functionName: 'pingDayPipeline (fallback path utan organization_id)',
    queryPurpose: 'Fallback day-wide hämtning när org_id saknas',
    limitValue: null,
    classification: 'legacy_review_later',
    status: 'pending_review',
    reason:
      'Fallback-grenen saknar organization_id som helpern kräver. Bör ersättas av strikt org_id-krav (RLS) snarare än paginerad helper.',
  },
  {
    file: 'supabase/functions/resolve-unknown-stop/index.ts',
    functionName: 'resolveUnknownStop (180-dagars history)',
    queryPurpose: '180-dagars historisk ping-lookup för unknown stop',
    limitValue: 5000,
    classification: 'legacy_review_later',
    status: 'pending_review',
    reason:
      'Multi-day historisk sökning — helpern är day-scoped. Behöver ny multi-day reader.',
  },

  // ── Latest / status — får behålla .limit(N) ─────────────────────────────
  {
    file: 'supabase/functions/_shared/diagnostics/buildTimerOwnershipDiagnostics.ts',
    functionName: 'buildTimerOwnershipDiagnostics',
    queryPurpose: 'Senaste ping för diagnostics',
    limitValue: 1,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'limit(1) — read-only senaste ping.',
  },
  {
    file: 'supabase/functions/get-staff-presence-day/index.ts',
    functionName: 'getStaffPresenceDay (last ping fallback)',
    queryPurpose: 'Senaste ping någonsin (fallback för lastPingAt)',
    limitValue: 1,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'limit(1) maybeSingle — ren latest-fallback.',
  },
  {
    file: 'supabase/functions/day-timeline-engine/index.ts',
    functionName: 'dayTimelineEngine (last ping)',
    queryPurpose: 'Senaste ping för dagen (signature)',
    limitValue: 1,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'limit(1) maybeSingle. Day-wide ping-loop ovanför är redan paginerad (range).',
  },
  {
    file: 'supabase/functions/day-timeline-engine/index.ts',
    functionName: 'dayTimelineEngine (page loop)',
    queryPurpose: 'Day-wide pings för timeline build',
    limitValue: null,
    classification: 'must_use_paginated_helper',
    status: 'pending_review',
    reason:
      'Egen paginerad range-loop (max 20 pages). Funktionellt korrekt men borde konsolideras till fetchAllStaffLocationPings.',
  },
  {
    file: 'supabase/functions/get-staff-presence/index.ts',
    functionName: 'getStaffPresence (latest per staff)',
    queryPurpose: 'Senaste ping per staff i en chunk',
    limitValue: 1000,
    classification: 'ok_latest',
    status: 'kept',
    reason:
      'Hämtar senaste ping per staff (DESC + first-per-staff). Inte day-wide tidsserie.',
  },
  {
    file: 'supabase/functions/get-target-presence/index.ts',
    functionName: 'getTargetPresence (latest per staff)',
    queryPurpose: 'Senaste ping per staff för target presence',
    limitValue: 2000,
    classification: 'ok_latest',
    status: 'kept',
    reason:
      'Latest-per-staff över org. Inte day-wide tidsserie. Kan dock missa vid mycket aktiva orgs — separat optimering.',
  },
  {
    file: 'supabase/functions/get-current-time-registration/index.ts',
    functionName: 'getCurrentTimeRegistration',
    queryPurpose: 'Recent pings för aktiv segment-klassning',
    limitValue: 200,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Smal fönster (sinceIso, ~20–30min). Status-query.',
  },
  {
    file: 'supabase/functions/get-active-time-registration-status/index.ts',
    functionName: 'getActiveTimeRegistrationStatus',
    queryPurpose: 'Recent pings (20 min) för aktiv timer-status',
    limitValue: 200,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Smal fönster, status-query.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (recent pings för current_kind)',
    queryPurpose: 'Recent pings för Time Engine current segment',
    limitValue: 500,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Smal fönster (sinceIso). Klassificering, inte day-wide.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (stop window pings)',
    queryPurpose: 'Pings inom stop-fönster (pingSince → now)',
    limitValue: 500,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Smalt fönster (typiskt minuter), används vid timer-stop.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (closest ping till tidpunkt)',
    queryPurpose: '±window snap till GPS för time_report-endpunkt',
    limitValue: null,
    classification: 'ok_latest',
    status: 'kept',
    reason:
      'Mycket smalt fönster (±15 min). Begränsad mängd — risk för 1000-default men ej day-wide.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (auto-detect resa ±15min anchors)',
    queryPurpose: 'Anchor-pings vid start/end ±15min',
    limitValue: 50,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Mycket små fönster, anchor-detection.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (latest ping för upload throttle)',
    queryPurpose: 'Senaste ping för 15s-upload throttle',
    limitValue: 1,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'limit(1) — throttle-check.',
  },
  {
    file: 'supabase/functions/mobile-app-api/index.ts',
    functionName: 'mobile-app-api (upload_location_batch dedup readback)',
    queryPurpose: 'Befintliga timestamps i window för dedup vid batch-insert',
    limitValue: null,
    classification: 'legacy_review_later',
    status: 'pending_review',
    reason:
      'Saknar .limit() — riskerar default 1000-cap vid stora batches. Bör konsolideras till paginerad readback eller flyttas till DB-unique-constraint.',
  },
  {
    file: 'supabase/functions/backfill-location-history/index.ts',
    functionName: 'backfillLocationHistory (dedup readback)',
    queryPurpose: 'Befintliga recorded_at för dedup innan insert',
    limitValue: null,
    classification: 'legacy_review_later',
    status: 'pending_review',
    reason:
      'Saknar .limit() — samma 1000-cap-risk som mobile-app-api. Lågfrekvent admin-flöde.',
  },
  {
    file: 'supabase/functions/sync-staff-day-report-cache/index.ts',
    functionName: 'syncStaffDayReportCache (distinct staff cursor)',
    queryPurpose: 'Distinct staff_id med ping sedan since (cursor-paginerad)',
    limitValue: null,
    classification: 'ok_latest',
    status: 'kept',
    reason: 'Egen cursor-paginerad range-loop. Distinct-listning, inte tidsserie.',
  },
  {
    file: 'supabase/functions/infer-home-location/index.ts',
    functionName: 'inferHomeLocation (cursor scan)',
    queryPurpose: 'Cursor-paginerad scan över alla staff för home-detection',
    limitValue: null,
    classification: 'ok_latest',
    status: 'kept',
    reason:
      'Cursor-paginerad cron över alla orgs och staff. Egen modell — helper är staff/org-scopad.',
  },
];

export interface GpsFetchConsistencyDiagnostics {
  dayWideQueriesUsingHelper: number;
  dayWideQueriesStillLimited: number;
  latestQueriesKept: number;
  legacyQueriesToReview: number;
  /** Totalt antal klassificerade queries (för transparens). */
  totalClassified: number;
  /** Topp-3 entries per status för snabb diagnos. */
  pendingReviewExamples: Array<{ file: string; functionName: string; reason: string }>;
}

export function summarizeGpsFetchConsistency(): GpsFetchConsistencyDiagnostics {
  let dayWideUsingHelper = 0;
  let dayWideStillLimited = 0;
  let latestKept = 0;
  let legacyToReview = 0;
  const pendingExamples: Array<{ file: string; functionName: string; reason: string }> = [];

  for (const e of GPS_FETCH_CONSISTENCY_REPORT) {
    if (e.classification === 'must_use_paginated_helper' && e.status === 'replaced_with_helper') {
      dayWideUsingHelper += 1;
    } else if (e.classification === 'must_use_paginated_helper' && e.status === 'pending_review') {
      dayWideStillLimited += 1;
      if (pendingExamples.length < 8) {
        pendingExamples.push({ file: e.file, functionName: e.functionName, reason: e.reason });
      }
    } else if (e.classification === 'ok_latest') {
      latestKept += 1;
    } else if (e.classification === 'legacy_review_later') {
      legacyToReview += 1;
      if (pendingExamples.length < 8) {
        pendingExamples.push({ file: e.file, functionName: e.functionName, reason: e.reason });
      }
    }
  }

  return {
    dayWideQueriesUsingHelper: dayWideUsingHelper,
    dayWideQueriesStillLimited: dayWideStillLimited,
    latestQueriesKept: latestKept,
    legacyQueriesToReview: legacyToReview,
    totalClassified: GPS_FETCH_CONSISTENCY_REPORT.length,
    pendingReviewExamples: pendingExamples,
  };
}
