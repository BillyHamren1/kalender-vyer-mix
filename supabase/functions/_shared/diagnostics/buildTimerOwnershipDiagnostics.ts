/**
 * READ-ONLY timer-ownership diagnostics.
 *
 * Single Timer Policy verifier. The Time app must own ONLY the workday
 * (active_time_registrations). This helper inspects the same tables the
 * mobile app would touch and surfaces a flat diagnostics object so we can
 * verify in production that no legacy project/booking/location/workday
 * timers were started.
 *
 *   - Mobile app owns only day start/stop.
 *   - Timeline allocation is owned by Time Engine.
 *   - GPS/geofence is evidence only, not a project timer.
 *
 * THIS MODULE MUST NOT WRITE OR MUTATE ANYTHING. All queries are SELECTs.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getStockholmDayWindowUtc } from '../stockholmDayWindow.ts';

export interface TimerOwnershipDiagnostics {
  // Active workday timer
  activeRegistrationId: string | null;
  activeRegistrationStatus: 'active' | 'stopped' | 'none';
  startSource: string | null;
  stopSource: string | null;
  autoStarted: boolean | null;
  autoStopped: boolean | null;
  startedAt: string | null;
  stoppedAt: string | null;

  // GPS evidence
  lastGpsPingAt: string | null;
  lastWorkAnchor: {
    targetType: string | null;
    targetId: string | null;
    targetLabel: string | null;
    at: string | null;
  } | null;
  homeDetected: boolean;

  // Decline / suppression / lock state
  autoStartRejectedReason: string | null;
  autoStopRejectedReason: string | null;
  userDeclinedToday: { count: number; latestAt: string | null };

  // Legacy-leak guard — these MUST stay zero in the new Time app.
  legacyTimerSourcesDetected: {
    currentTimeRegistrationOpen: number;
    locationTimeEntriesOpen: number;
    workdaysOpenToday: number;
    note: string;
  };

  generatedAt: string;
}

const EMPTY_LEGACY = {
  currentTimeRegistrationOpen: 0,
  locationTimeEntriesOpen: 0,
  workdaysOpenToday: 0,
  note:
    'These tables are LEGACY for the Time app. Mobile must only use ' +
    'active_time_registrations. Non-zero values indicate a regression.',
};

export async function buildTimerOwnershipDiagnostics(args: {
  admin: SupabaseClient;
  organizationId: string;
  staffId: string;
  /** Local YYYY-MM-DD (Stockholm). Defaults to today. */
  date?: string;
}): Promise<TimerOwnershipDiagnostics> {
  const { admin, organizationId, staffId } = args;
  const date =
    args.date ??
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

  const win = getStockholmDayWindowUtc(date);
  const out: TimerOwnershipDiagnostics = {
    activeRegistrationId: null,
    activeRegistrationStatus: 'none',
    startSource: null, stopSource: null,
    autoStarted: null, autoStopped: null,
    startedAt: null, stoppedAt: null,
    lastGpsPingAt: null,
    lastWorkAnchor: null,
    homeDetected: false,
    autoStartRejectedReason: null,
    autoStopRejectedReason: null,
    userDeclinedToday: { count: 0, latestAt: null },
    legacyTimerSourcesDetected: { ...EMPTY_LEGACY },
    generatedAt: new Date().toISOString(),
  };

  // --- 1) Latest registration for the local day (active or stopped) ---
  try {
    const { data: reg } = await admin
      .from('active_time_registrations')
      .select(
        'id, status, started_at, stopped_at, start_source, stop_source, auto_started, ' +
        'current_target_type, current_target_id, current_label',
      )
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('started_at', win.startUtc)
      .lte('started_at', win.endUtc)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reg) {
      const r: any = reg;
      out.activeRegistrationId = r.id as string;
      out.activeRegistrationStatus = (r.status as 'active' | 'stopped') ?? 'none';
      out.startSource = (r.start_source as string | null) ?? null;
      out.stopSource = (r.stop_source as string | null) ?? null;
      out.autoStarted = (r.auto_started as boolean | null) ?? null;
      out.autoStopped =
        out.activeRegistrationStatus === 'stopped' &&
        typeof r.stop_source === 'string' &&
        r.stop_source.startsWith('auto_');
      out.startedAt = (r.started_at as string | null) ?? null;
      out.stoppedAt = (r.stopped_at as string | null) ?? null;
      if (r.current_target_id || r.current_label) {
        out.lastWorkAnchor = {
          targetType: (r.current_target_type as string | null) ?? null,
          targetId: (r.current_target_id as string | null) ?? null,
          targetLabel: (r.current_label as string | null) ?? null,
          at: out.startedAt,
        };
      }
    }
  } catch (_) { /* ignore — diagnostics must never throw */ }

  // --- 2) Last GPS ping (read-only signal from staff_location_history) ---
  try {
    const { data: ping } = await admin
      .from('staff_location_history')
      .select('recorded_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('recorded_at', win.startUtc)
      .lte('recorded_at', win.endUtc)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ping?.recorded_at) out.lastGpsPingAt = ping.recorded_at as string;
  } catch (_) { /* ignore */ }

  // --- 3) Home / private-zone presence (curated or inferred) ---
  try {
    const [{ count: priv }, { count: inf }] = await Promise.all([
      admin.from('staff_private_zones')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('staff_id', staffId),
      admin.from('staff_inferred_home_locations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('staff_id', staffId)
        .is('valid_until', null),
    ] as any);
    out.homeDetected = (priv ?? 0) > 0 || (inf ?? 0) > 0;
  } catch (_) { /* ignore */ }

  // --- 4) Decline log (user said "no" today) ---
  try {
    const { data: declines } = await admin
      .from('auto_start_decline_log')
      .select('declined_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('local_date', date)
      .order('declined_at', { ascending: false });
    if (declines && declines.length) {
      out.userDeclinedToday = {
        count: declines.length,
        latestAt: (declines[0] as any).declined_at as string,
      };
    }
  } catch (_) { /* ignore */ }

  // --- 5) Active suppression row (auto_stop or user-ended) ---
  try {
    const { data: sup } = await admin
      .from('time_auto_start_suppressions')
      .select('reason, suppressed_until')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('date', date)
      .gt('suppressed_until', new Date().toISOString())
      .order('suppressed_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sup) {
      out.autoStartRejectedReason = (sup.reason as string | null) ?? 'suppressed';
    }
  } catch (_) { /* ignore */ }

  // --- 6) Legacy-leak guard: count anything still open in old timer tables ---
  try {
    const [cur, lte, wd] = await Promise.all([
      admin.from('current_time_registration')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('staff_id', staffId),
      admin.from('location_time_entries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('staff_id', staffId)
        .is('exited_at', null),
      admin.from('workdays')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('staff_id', staffId)
        .gte('started_at', win.startUtc).lte('started_at', win.endUtc)
        .is('ended_at', null),
    ] as any);
    out.legacyTimerSourcesDetected = {
      currentTimeRegistrationOpen: (cur as any).count ?? 0,
      locationTimeEntriesOpen: (lte as any).count ?? 0,
      workdaysOpenToday: (wd as any).count ?? 0,
      note: EMPTY_LEGACY.note,
    };
  } catch (_) { /* ignore — legacy tables may not exist in all orgs */ }

  return out;
}
