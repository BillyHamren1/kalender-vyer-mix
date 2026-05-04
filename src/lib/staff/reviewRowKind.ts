/**
 * ReviewRowKind — explicit taxonomi för UI-rader i tidrapportgranskningen.
 *
 * Bakgrund: tidigare UI kallade allt "Fördelad tid" — även en öppen timer,
 * ett GPS-bevis eller ett gap-derived restids-förslag. Det gjorde att en
 * aktiv Craft-timer kunde dyka upp i tabellen "Fördelad tid · per
 * projekt/plats" trots att headern samtidigt sa "Fördelad 0h".
 *
 * Den här modulen definierar en låst lista av radtyper och en ren
 * klassificeringsfunktion. Reglerna är:
 *
 *   confirmed_distribution
 *     Stängd/sparad time_report ELLER stängd location work timer.
 *     RÄKNAS i distributedMinutes. Visas i sektion "Bekräftad fördelning".
 *
 *   active_distribution
 *     Öppen LTE/time_report (ingen end_time eller ongoing=true).
 *     RÄKNAS INTE i confirmed distributedMinutes. Visas EXKLUSIVT i
 *     sektion "Pågående aktivitet" som preliminär fördelning.
 *
 *   suggested_distribution
 *     Assistant-/GPS-förslag på fördelning som admin måste godkänna.
 *     Räknas inte förrän godkänd → blir då confirmed_distribution.
 *
 *   presence_evidence
 *     GPS/geofence/närvaro utan booking/lp-koppling. Visas i
 *     händelsejournalen — ALDRIG som arbetstid direkt.
 *
 *   gps_evidence
 *     Ren GPS-stayPoint/movement/gap. Visas i händelsejournal/debug.
 *     Aldrig fördelad tid.
 *
 *   anomaly
 *     Avvikelse från workday_flags eller härledd kontroll (saknad rast,
 *     pre_workday_activity, signal tappad …). Inte tid, bara markör.
 *
 *   travel_suggestion
 *     gap_derived eller auto_detected travel_time_log som ännu inte är
 *     godkänd. Räknas INTE som extra lön ovanpå workday — visas i egen
 *     sektion "Föreslagen restid".
 *
 * En godkänd travel_time_log → klassas som confirmed_distribution
 * (lönegrundande tid är fortfarande workday-baserad i canonicalDayModel,
 * men i fördelningstabellen syns den som bekräftad fördelning).
 */

export type ReviewRowKind =
  | 'confirmed_distribution'
  | 'active_distribution'
  | 'suggested_distribution'
  | 'presence_evidence'
  | 'gps_evidence'
  | 'anomaly'
  | 'travel_suggestion';

/** UI-sektion en rad ska renderas i. */
export type ReviewRowSection =
  | 'workday_payroll'        // 1. Arbetsdag / lön
  | 'active_activity'        // 2. Pågående aktivitet
  | 'confirmed_distribution' // 3. Bekräftad fördelning
  | 'undistributed'          // 4. Ofördelad tid
  | 'suggestions'            // 5. Föreslagen restid/fördelning
  | 'event_journal'          // 6. Dagens händelsejournal
  | 'debug_gps';             // 7. Rå GPS-data / debug

export const SECTION_FOR_KIND: Record<ReviewRowKind, ReviewRowSection> = {
  confirmed_distribution: 'confirmed_distribution',
  active_distribution: 'active_activity',
  suggested_distribution: 'suggestions',
  presence_evidence: 'event_journal',
  gps_evidence: 'debug_gps',
  anomaly: 'event_journal',
  travel_suggestion: 'suggestions',
};

/**
 * En rad räknas i `distributedMinutes` ENDAST om den är confirmed.
 * Allt annat (active, suggested, evidence, anomaly, travel-suggestion)
 * är preliminärt och får inte öka fördelad tid.
 */
export function countsInDistributedMinutes(kind: ReviewRowKind): boolean {
  return kind === 'confirmed_distribution';
}

// ── Klassificeringsindata ────────────────────────────────────────────

export type RowSourceTable =
  | 'time_report'
  | 'location_entry'
  | 'travel_log'
  | 'assistant_event'
  | 'gps_stay_point'
  | 'gps_gap'
  | 'workday_flag';

export interface ReviewRowClassificationInput {
  /** Vilken tabell raden kommer från. */
  sourceTable: RowSourceTable;
  /** Är posten avslutad (har end_time / exited_at)? */
  closed: boolean;
  /** Är posten godkänd? (time_report.approved / travel_time_log.approved) */
  approved?: boolean;
  /**
   * För location_entry: är raden klassad som arbetstimer (true) eller
   * presence-only (false)? Använd `classifyLocationEntry` för att räkna
   * ut detta innan klassificering.
   */
  isLocationWorkTimer?: boolean;
  /**
   * För travel_log: är den auto-detekterad / gap-derived?
   * (Manuellt registrerad travel = direkt confirmed när godkänd.)
   */
  travelAutoDetected?: boolean;
}

export function classifyReviewRow(input: ReviewRowClassificationInput): ReviewRowKind {
  switch (input.sourceTable) {
    case 'time_report':
      // Öppen rapport = pågående aktivitet.
      if (!input.closed) return 'active_distribution';
      return 'confirmed_distribution';

    case 'location_entry':
      // Presence-only LTE → bara bevis, aldrig fördelning.
      if (input.isLocationWorkTimer === false) return 'presence_evidence';
      // Arbetstimer på plats: öppen = pågående, stängd = bekräftad.
      if (!input.closed) return 'active_distribution';
      return 'confirmed_distribution';

    case 'travel_log':
      // Auto-detekterad/gap-derived och inte godkänd → förslag.
      if (input.travelAutoDetected && !input.approved) return 'travel_suggestion';
      // Godkänd resa räknas som bekräftad fördelning.
      if (input.approved) return 'confirmed_distribution';
      // Manuellt registrerad men inte godkänd → förslag (admin måste OK:a).
      return 'suggested_distribution';

    case 'assistant_event':
      return 'suggested_distribution';

    case 'gps_stay_point':
      return 'presence_evidence';

    case 'gps_gap':
      return 'gps_evidence';

    case 'workday_flag':
      return 'anomaly';
  }
}
