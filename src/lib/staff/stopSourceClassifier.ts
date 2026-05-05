/**
 * classifyStopSource — bestämmer hur en timer (location_time_entry) stoppades
 * baserat på lte.source + lte.metadata. Output används i admin-UI för att
 * visa en mänsklig "Timer stoppad av X"-text och badge.
 *
 * Metadata-källa: spegling av fält som skrivs av:
 *   - useGeofencing.ts                 → metadata.stop_source='geofence_auto', stop_reason
 *   - process-location-auto-start      → metadata.closed_by='server_auto_switch', switch.*, run_id
 *   - mobile-app-api save_then_stop    → metadata.stop_source='time_report_save'
 *   - close-stale-workday-entries      → source='watchdog' / metadata.stop_source='watchdog'
 *   - admin-UI manual edit             → metadata.stop_source='admin_manual', stopped_by
 *
 * Prio-ordning (stark → svag):
 *   admin → watchdog → server_auto_switch → server_background_gps
 *   → geofence_foreground → time_report_save → user_manual → unknown
 */

export type StopSourceKey =
  | 'admin'
  | 'watchdog'
  | 'server_auto_switch'
  | 'server_background_gps'
  | 'geofence_foreground'
  | 'time_report_save'
  | 'user_manual'
  | 'unknown';

export interface StopSourceClass {
  key: StopSourceKey;
  /** Kort badge-text. */
  shortLabel: string;
  /** Längre mening: "Timer stoppad av …". */
  fullText: string;
  /** Tailwind tone-namn (mappas i UI). */
  tone: 'slate' | 'violet' | 'orange' | 'indigo' | 'emerald' | 'sky' | 'teal' | 'gray';
  /** Råa fält för tooltip/expand. */
  details: {
    stopSource: string | null;
    stopReason: string | null;
    stoppedBy: string | null;
    stoppedAt: string | null;
    sourceEntryId: string | null;
    linkedTimeReportId: string | null;
    runId: string | null;
    autoSwitch: boolean;
    departureAt: string | null;
    confidence: string | number | null;
  };
}

function pick<T = any>(o: any, ...keys: string[]): T | null {
  if (!o || typeof o !== 'object') return null;
  for (const k of keys) {
    if (o[k] != null) return o[k];
  }
  return null;
}

export function classifyStopSource(args: {
  source: string | null;
  metadata: Record<string, any> | null;
  exitedAt: string | null;
  lteId: string;
}): StopSourceClass {
  const m = (args.metadata && typeof args.metadata === 'object') ? args.metadata : {};
  const src = (args.source ?? '').toLowerCase();
  const metaStopSrc = String(pick(m, 'stop_source', 'closed_at_source', 'closed_by') ?? '').toLowerCase();
  const metaStopReason = pick<string>(m, 'stop_reason', 'reason', 'close_reason');
  const stoppedBy = pick<string>(m, 'stopped_by', 'closed_by', 'actor', 'admin_user_id');
  const runId = pick<string>(m, 'run_id');
  const departureAt = pick<string>(m, 'departure_at') ?? pick<string>(m?.switch, 'departure_at');
  const confidence = pick<string | number>(m, 'confidence') ?? pick<string | number>(m?.switch, 'confidence');
  const linkedTr = pick<string>(m, 'linked_time_report_id', 'time_report_id');

  const details: StopSourceClass['details'] = {
    stopSource: metaStopSrc || src || null,
    stopReason: metaStopReason ?? null,
    stoppedBy: stoppedBy ?? null,
    stoppedAt: args.exitedAt,
    sourceEntryId: args.lteId,
    linkedTimeReportId: linkedTr ?? null,
    runId: runId ?? null,
    autoSwitch: !!m?.switch || metaStopSrc.includes('switch'),
    departureAt: departureAt ?? null,
    confidence: confidence ?? null,
  };

  // 1. Admin manual edit
  if (
    metaStopSrc === 'admin_manual' || metaStopSrc === 'admin_ui' || metaStopSrc === 'admin_correction'
    || src === 'admin_manual' || src === 'admin_ui'
    || (stoppedBy && metaStopSrc === '' && (m?.actor === 'admin' || m?.admin_user_id))
  ) {
    return {
      key: 'admin', tone: 'violet',
      shortLabel: 'Admin',
      fullText: 'Timer stoppad av admin',
      details,
    };
  }

  // 2. Watchdog / stale auto-close
  if (
    src === 'watchdog' || src === 'cron' || src === 'system'
    || src === 'auto_assigned' || src === 'auto_assigned_bg' || src === 'auto_assigned_backfill'
    || src === 'ai_reconciled'
    || metaStopSrc.includes('watchdog') || metaStopSrc.includes('stale') || metaStopSrc === 'auto_close_stale'
  ) {
    return {
      key: 'watchdog', tone: 'orange',
      shortLabel: 'Watchdog',
      fullText: 'Timer stoppad av watchdog (stale / auto-close)',
      details,
    };
  }

  // 3. Server auto-switch (process-location-auto-start)
  if (
    metaStopSrc === 'server_auto_switch' || metaStopSrc === 'geofence_auto_switch_server'
    || metaStopSrc === 'geofence_auto_switch_server_backfill'
    || details.autoSwitch
  ) {
    return {
      key: 'server_auto_switch', tone: 'indigo',
      shortLabel: 'Auto-switch (server)',
      fullText: 'Timer stoppad av servermotor: byte till ny arbetsplats',
      details,
    };
  }

  // 4. Server background GPS (engine, ej switch)
  if (
    metaStopSrc === 'server_background_gps' || metaStopSrc === 'server_background_gps_backfill'
    || src === 'server_background_gps' || src === 'server_background_gps_backfill'
  ) {
    return {
      key: 'server_background_gps', tone: 'emerald',
      shortLabel: 'Server-GPS',
      fullText: 'Timer stoppad av servermotor: GPS-baserad lämning',
      details,
    };
  }

  // 5. Geofence foreground (mobil)
  if (
    metaStopSrc === 'geofence_auto' || metaStopSrc === 'geofence_foreground'
    || metaStopSrc === 'foreground_geofence' || src === 'auto_geofence'
  ) {
    return {
      key: 'geofence_foreground', tone: 'sky',
      shortLabel: 'Geofence',
      fullText: details.stopReason === 'stable_exit'
        ? 'Timer stoppad automatiskt: lämnade plats'
        : 'Timer stoppad automatiskt (geofence i mobilen)',
      details,
    };
  }

  // 6. Time report save / save-then-stop
  if (
    metaStopSrc === 'time_report_save' || metaStopSrc === 'save_then_stop'
    || metaStopSrc === 'time_report_stop' || metaStopSrc === 'stop_session'
    || src === 'time_report_save' || src === 'save_then_stop'
  ) {
    return {
      key: 'time_report_save', tone: 'teal',
      shortLabel: 'Tidrapport',
      fullText: 'Timer stoppad vid sparad tidrapport',
      details,
    };
  }

  // 7. User manual via mobile app
  if (
    src === 'manual' || src === 'mobile_app' || src === 'user'
    || metaStopSrc === 'user' || metaStopSrc === 'mobile_app' || metaStopSrc === 'manual'
  ) {
    return {
      key: 'user_manual', tone: 'slate',
      shortLabel: 'Användare',
      fullText: 'Timer stoppad av användaren',
      details,
    };
  }

  return {
    key: 'unknown', tone: 'gray',
    shortLabel: 'Okänd källa',
    fullText: 'Timer stoppad – källa okänd',
    details,
  };
}

export const STOP_SOURCE_BADGE_CLASSES: Record<StopSourceClass['tone'], string> = {
  slate:   'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',
  violet:  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  orange:  'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  indigo:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  sky:     'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  teal:    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  gray:    'bg-muted text-muted-foreground border border-border',
};
