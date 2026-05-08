// @ts-nocheck
/**
 * processStaffLocationUpdate — LEGACY / DISABLED
 * ────────────────────────────────────────────────────────────────────────────
 * DEPRECATED. Denna fil var tidigare bryggan mellan staff_location_history
 * och den gamla server-driven kedjan (process-location-auto-start →
 * workday → location_time_entries → travel_time_logs).
 *
 * Den kedjan är AVSLAGEN. GPS får inte längre starta workday/LTE/travel.
 * Den nya Time Engine (supabase/functions/_shared/time-engine/ +
 * processGpsTimelineForAutoStart) äger allt GPS → tidsmotor-flöde och
 * skriver enbart till `active_time_registrations`.
 *
 * Funktionen finns kvar enbart som no-op shim så ev. kvarglömda anrop inte
 * kraschar — den anropar INTE process-location-auto-start och rör ingen
 * tabell. Den returnerar ett tydligt disabled-svar.
 *
 * Får ej återaktiveras. Ta bort när inga importer finns kvar.
 */

export interface ProcessLocationUpdateArgs {
  staffId: string;
  organizationId: string;
  dates: string[];
  source?: string;
}

export interface ProcessLocationUpdateResult {
  ok: false;
  disabled: true;
  reason: "legacy_processStaffLocationUpdate_disabled_use_time_engine";
}

/**
 * LEGACY DISABLED. Returns a single disabled marker regardless of input.
 * Does not call process-location-auto-start. Does not touch any table.
 */
export async function processStaffLocationUpdate(
  _supabase: any,
  _args: ProcessLocationUpdateArgs,
): Promise<ProcessLocationUpdateResult> {
  return {
    ok: false,
    disabled: true,
    reason: "legacy_processStaffLocationUpdate_disabled_use_time_engine",
  };
}
