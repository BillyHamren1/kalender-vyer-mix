// ============================================================================
// process-location-auto-start :: engine (DISABLED WRAPPER)
// ----------------------------------------------------------------------------
// The original GPS-auto-start engine has been retired. All GPS-driven
// auto-start now lives in the new Time Engine:
//
//   supabase/functions/_shared/time-engine/processGpsTimelineForAutoStart.ts
//   supabase/functions/_shared/time-engine/decideAutoStart.ts
//
// The new engine writes ONLY to `active_time_registrations`. It MUST NOT
// touch workdays / location_time_entries / time_reports / travel_time_logs /
// assistant_events.
//
// The old engine code is preserved in `./legacy-engine-disabled.ts` for
// historical reference only. It is NOT imported here and NOT executed.
// Do not re-import it. Do not re-enable it. If the policy ever needs to
// change, edit the new Time Engine instead.
// ============================================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const ENGINE_VERSION = 'auto-start@disabled'

/** Permanent kill-switch — kept exported for callers that still read it. */
export const LEGACY_TIME_WRITES_DISABLED = true as const

export interface ProcessReport {
  ok: false
  disabled: true
  reason: 'legacy_time_engine_disabled_use_new_time_engine'
  engine_version: string
  run_id: string
  mode: 'cron' | 'backfill_day'
  /** All counters are zero — engine performs no writes. */
  staff: 0
  pings: 0
  arrivals: 0
  switches: 0
  workdays_opened: 0
  ltes_opened: 0
  ltes_closed: 0
  travels_created: 0
  events_emitted: 0
  skipped_existing: 0
  errors: []
  plan: []
}

function disabledReport(mode: 'cron' | 'backfill_day'): ProcessReport {
  return {
    ok: false,
    disabled: true,
    reason: 'legacy_time_engine_disabled_use_new_time_engine',
    engine_version: ENGINE_VERSION,
    run_id:
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    mode,
    staff: 0,
    pings: 0,
    arrivals: 0,
    switches: 0,
    workdays_opened: 0,
    ltes_opened: 0,
    ltes_closed: 0,
    travels_created: 0,
    events_emitted: 0,
    skipped_existing: 0,
    errors: [],
    plan: [],
  }
}

/**
 * Permanently-disabled entry point. Returns a uniform "disabled" envelope
 * and never touches the database. New GPS auto-start logic must run via
 * the Time Engine: `_shared/time-engine/processGpsTimelineForAutoStart`.
 */
// deno-lint-ignore no-unused-vars
export async function runEngine(_supabase: unknown, body: any): Promise<ProcessReport> {
  const mode: 'cron' | 'backfill_day' =
    body?.action === 'backfill_day' ? 'backfill_day' : 'cron'
  console.warn(
    '[process-location-auto-start] runEngine called but DISABLED — ' +
      'use new Time Engine (processGpsTimelineForAutoStart) instead.',
  )
  return disabledReport(mode)
}
