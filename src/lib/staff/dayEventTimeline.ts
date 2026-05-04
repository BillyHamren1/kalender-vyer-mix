/**
 * buildStaffDayEventTimeline
 *
 * Pure helper that combines every available signal for one staff member's day
 * into a single, chronologically ordered list of `DayEvent` rows the admin
 * UI can render as "Dagens händelsejournal".
 *
 * The intent is that the journal answers "vad gjorde personen?" — not just
 * "vad har de rapporterat?". So we mix:
 *
 *   • workday start/slut                       (lönegrundande ramar)
 *   • location_time_entries start/stop         (timer/närvaro)
 *   • time_reports start/end                   (bekräftad fördelning)
 *   • travel_time_logs start/end               (bekräftad/föreslagen resa)
 *   • assistant_events                         (ankomst/lämnade enligt assistent)
 *   • workday_flags                            (frågor systemet ställt)
 *   • staff_location_history → stayPoints      (anlände/lämnade plats enligt GPS)
 *   • staff_location_history → gps gaps        (signal tappad)
 *
 * Pings clusteras via `clusterStayPoints`; vi visar ALDRIG råpings som rader
 * i huvudlistan, bara grupperade händelser.
 *
 * Pre-workday activity:
 *   GPS-stayPoints med start före workday.started_at flaggas som
 *   `pre_workday_activity` så admin ser att personen rörde sig innan
 *   arbetsdagen formellt började — utan att lön ändras.
 */
import { clusterStayPoints, type StayPoint } from './stayPoints';
import type { Ping } from './movementDetection';

export type DayEventKind =
  | 'workday_start'
  | 'workday_end'
  | 'lte_start'
  | 'lte_end'
  | 'time_report_start'
  | 'time_report_end'
  | 'travel_start'
  | 'travel_end'
  | 'assistant_arrival'
  | 'assistant_departure'
  | 'assistant_other'
  | 'gps_arrived'
  | 'gps_left'
  | 'gps_movement'
  | 'gps_gap'
  | 'pre_workday_activity'
  | 'workday_flag';

export type DayEventSource =
  | 'workday'
  | 'timer'
  | 'travel'
  | 'assistant'
  | 'gps'
  | 'flag'
  | 'admin';

export type DayEventStatus = 'confirmed' | 'suggested' | 'uncertain';

export type DayEventSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface DayEvent {
  /** Stable React key. */
  id: string;
  /** ISO timestamp the event happened. */
  at: string;
  /** Optional ISO end (for ranges: gap, movement, span). */
  until?: string | null;
  /** Optional duration in minutes (auto-derived from at/until when both present). */
  durationMin?: number;
  kind: DayEventKind;
  source: DayEventSource;
  status: DayEventStatus;
  severity: DayEventSeverity;
  /** Primary label rendered in the row. */
  label: string;
  /** Optional secondary line. */
  detail?: string | null;
  /** Optional plats/projekt link string. */
  place?: string | null;
  /** Free-form metadata for expand drawer. */
  meta?: Record<string, unknown>;
}

// ── Inputs ───────────────────────────────────────────────────────────────

export interface RawDtWorkday {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export interface RawDtLte {
  id: string;
  entered_at: string;
  exited_at: string | null;
  label: string;
  source?: string | null;
  isPresenceOnly?: boolean;
}

export interface RawDtTimeReport {
  id: string;
  start_iso: string;
  end_iso: string | null;
  label: string;
  approved?: boolean;
}

export interface RawDtTravel {
  id: string;
  start_iso: string;
  end_iso: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  approved?: boolean;
  autoDetected?: boolean;
  sourceTag?: string | null;
}

export interface RawDtAssistantEvent {
  id: string;
  event_type: string;       // 'arrival' | 'departure' | etc.
  happened_at: string;
  target_label?: string | null;
  target_address?: string | null;
  source?: string | null;
  resolution_status?: string | null;
}

export interface RawDtWorkdayFlag {
  id: string;
  flag_type: string;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  created_at: string;
  resolved?: boolean | null;
  needs_user_input?: boolean | null;
}

export interface BuildDayTimelineInput {
  /** Day boundaries (ISO) — used to filter pings/events to the displayed day. */
  dayStartIso: string;
  dayEndIso: string;
  workdays: RawDtWorkday[];
  ltes: RawDtLte[];
  timeReports: RawDtTimeReport[];
  travel: RawDtTravel[];
  assistantEvents: RawDtAssistantEvent[];
  flags: RawDtWorkdayFlag[];
  pings: Ping[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

const fmtMin = (m: number): string => {
  if (m < 1) return '<1m';
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
};

const sevOf = (s?: string | null): DayEventSeverity => {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'critical';
    case 'warning': return 'warning';
    case 'success': return 'success';
    default: return 'info';
  }
};

const PRESENCE_LIKE_SOURCES = new Set(['gps', 'geofence', 'geofence_foreground', 'geofence_background']);

// ── Stay-point → events conversion ───────────────────────────────────────

const STAY_RADIUS_M = 250;
const STAY_MIN_MIN = 5;
const GAP_THRESHOLD_MIN = 20;

interface StayDerived {
  stays: StayPoint[];
  gaps: Array<{ start: string; end: string; minutes: number }>;
}

const deriveStaysAndGaps = (pings: Ping[]): StayDerived => {
  if (pings.length === 0) return { stays: [], gaps: [] };
  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const stays = clusterStayPoints(sorted, {
    radiusMeters: STAY_RADIUS_M,
    minDurationMin: STAY_MIN_MIN,
  });
  const gaps: StayDerived['gaps'] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt = minutesBetween(sorted[i - 1].recorded_at, sorted[i].recorded_at);
    if (dt >= GAP_THRESHOLD_MIN) {
      gaps.push({
        start: sorted[i - 1].recorded_at,
        end: sorted[i].recorded_at,
        minutes: dt,
      });
    }
  }
  return { stays, gaps };
};

// ── Main ─────────────────────────────────────────────────────────────────

export function buildStaffDayEventTimeline(input: BuildDayTimelineInput): DayEvent[] {
  const events: DayEvent[] = [];

  const workdayStartMs = input.workdays
    .map(w => new Date(w.started_at).getTime())
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b)[0] ?? null;

  // 1) Workday start/end
  for (const wd of input.workdays) {
    events.push({
      id: `wd-start:${wd.id}`,
      at: wd.started_at,
      kind: 'workday_start',
      source: 'workday',
      status: 'confirmed',
      severity: 'success',
      label: 'Arbetsdag startad',
    });
    if (wd.ended_at) {
      events.push({
        id: `wd-end:${wd.id}`,
        at: wd.ended_at,
        kind: 'workday_end',
        source: 'workday',
        status: 'confirmed',
        severity: 'success',
        label: 'Arbetsdag avslutad',
        durationMin: minutesBetween(wd.started_at, wd.ended_at),
      });
    }
  }

  // 2) LTE start/stop. Presence-only LTE = uncertain (passive marker).
  for (const e of input.ltes) {
    const presence = !!e.isPresenceOnly || PRESENCE_LIKE_SOURCES.has((e.source || '').toLowerCase());
    events.push({
      id: `lte-start:${e.id}`,
      at: e.entered_at,
      kind: 'lte_start',
      source: presence ? 'gps' : 'timer',
      status: presence ? 'uncertain' : 'confirmed',
      severity: 'info',
      label: presence ? `Närvaro registrerad: ${e.label}` : `Timer startad: ${e.label}`,
      place: e.label,
      meta: { source: e.source ?? null, presence },
    });
    if (e.exited_at) {
      events.push({
        id: `lte-end:${e.id}`,
        at: e.exited_at,
        kind: 'lte_end',
        source: presence ? 'gps' : 'timer',
        status: presence ? 'uncertain' : 'confirmed',
        severity: 'info',
        label: presence ? `Närvaro avslutad: ${e.label}` : `Timer stoppad: ${e.label}`,
        place: e.label,
        durationMin: minutesBetween(e.entered_at, e.exited_at),
      });
    }
  }

  // 3) time_reports start/end
  for (const r of input.timeReports) {
    events.push({
      id: `tr-start:${r.id}`,
      at: r.start_iso,
      kind: 'time_report_start',
      source: 'admin',
      status: 'confirmed',
      severity: 'info',
      label: `Tidrapport startad: ${r.label}`,
      place: r.label,
      meta: { approved: !!r.approved },
    });
    if (r.end_iso) {
      events.push({
        id: `tr-end:${r.id}`,
        at: r.end_iso,
        kind: 'time_report_end',
        source: 'admin',
        status: r.approved ? 'confirmed' : 'suggested',
        severity: 'info',
        label: `Tidrapport avslutad: ${r.label}`,
        place: r.label,
        durationMin: minutesBetween(r.start_iso, r.end_iso),
      });
    }
  }

  // 4) travel
  for (const t of input.travel) {
    const dest = (t.toAddress || '').split(',')[0].trim() || '—';
    const orig = (t.fromAddress || '').split(',')[0].trim() || '—';
    const status: DayEventStatus = t.approved ? 'confirmed' : 'suggested';
    events.push({
      id: `tv-start:${t.id}`,
      at: t.start_iso,
      kind: 'travel_start',
      source: 'travel',
      status,
      severity: 'info',
      label: `Resa startade: ${orig} → ${dest}`,
      detail: t.autoDetected ? 'Auto-detekterad' : t.sourceTag === 'gap_derived' ? 'Härledd från lucka' : null,
    });
    if (t.end_iso) {
      events.push({
        id: `tv-end:${t.id}`,
        at: t.end_iso,
        kind: 'travel_end',
        source: 'travel',
        status,
        severity: 'info',
        label: `Resa avslutad: ${dest}`,
        durationMin: minutesBetween(t.start_iso, t.end_iso),
      });
    }
  }

  // 5) assistant_events (arrival/departure/other)
  for (const a of input.assistantEvents) {
    const t = (a.event_type || '').toLowerCase();
    const place = a.target_label || a.target_address || null;
    const isArrival = t.includes('arriv') || t.includes('arrival');
    const isDeparture = t.includes('depart') || t.includes('left');
    const kind: DayEventKind = isArrival
      ? 'assistant_arrival'
      : isDeparture
        ? 'assistant_departure'
        : 'assistant_other';
    const verb = isArrival ? 'Ankom' : isDeparture ? 'Lämnade' : 'Händelse';
    events.push({
      id: `ae:${a.id}`,
      at: a.happened_at,
      kind,
      source: 'assistant',
      status: a.resolution_status === 'resolved' ? 'confirmed' : 'suggested',
      severity: 'info',
      label: place ? `${verb} ${place} (assistent)` : `Assistenthändelse: ${a.event_type}`,
      place,
      detail: a.source ? `Källa: ${a.source}` : null,
    });
  }

  // 6) workday_flags
  for (const f of input.flags) {
    events.push({
      id: `wf:${f.id}`,
      at: f.created_at,
      kind: 'workday_flag',
      source: 'flag',
      status: f.resolved ? 'confirmed' : 'suggested',
      severity: sevOf(f.severity),
      label: f.title || `Avvikelse: ${f.flag_type}`,
      detail: f.description || null,
      meta: { needs_user_input: !!f.needs_user_input, resolved: !!f.resolved },
    });
  }

  // 7) GPS — clustered into stayPoints + movement/gap events
  const { stays, gaps } = deriveStaysAndGaps(input.pings);
  for (let i = 0; i < stays.length; i++) {
    const s = stays[i];
    const isPreWorkday = workdayStartMs != null && new Date(s.start).getTime() < workdayStartMs;

    // Anlände
    events.push({
      id: `gps-arr:${s.start}`,
      at: s.start,
      kind: isPreWorkday ? 'pre_workday_activity' : 'gps_arrived',
      source: 'gps',
      status: 'suggested',
      severity: isPreWorkday ? 'warning' : 'info',
      label: isPreWorkday
        ? `GPS visar aktivitet före arbetsdag (${fmtMin(s.durationMin)})`
        : `GPS: Anlände plats (${fmtMin(s.durationMin)})`,
      detail: `${s.pingCount} pings · centrum ${s.centre.lat.toFixed(4)}, ${s.centre.lng.toFixed(4)}`,
      meta: { centre: s.centre, pingCount: s.pingCount },
    });
    // Lämnade
    events.push({
      id: `gps-left:${s.end}`,
      at: s.end,
      kind: 'gps_left',
      source: 'gps',
      status: 'suggested',
      severity: 'info',
      label: 'GPS: Lämnade plats',
      detail: `${s.pingCount} pings · ${fmtMin(s.durationMin)} på platsen`,
      meta: { centre: s.centre, pingCount: s.pingCount },
    });

    // Movement between two adjacent stays
    const next = stays[i + 1];
    if (next && new Date(next.start).getTime() > new Date(s.end).getTime()) {
      events.push({
        id: `gps-move:${s.end}->${next.start}`,
        at: s.end,
        until: next.start,
        kind: 'gps_movement',
        source: 'gps',
        status: 'suggested',
        severity: 'info',
        label: 'Rörelse mellan platser',
        durationMin: minutesBetween(s.end, next.start),
      });
    }
  }
  for (const g of gaps) {
    events.push({
      id: `gps-gap:${g.start}`,
      at: g.start,
      until: g.end,
      kind: 'gps_gap',
      source: 'gps',
      status: 'uncertain',
      severity: g.minutes >= 60 ? 'warning' : 'info',
      label: `GPS-gap (${fmtMin(g.minutes)})`,
      detail: 'Ingen ping mottagen',
      durationMin: g.minutes,
    });
  }

  // Sort + assign durations where missing
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const ev of events) {
    if (ev.durationMin == null && ev.until) {
      ev.durationMin = minutesBetween(ev.at, ev.until);
    }
  }
  return events;
}

/** Convenience: detect "GPS aktivitet före arbetsdag" anomaly from events. */
export function hasPreWorkdayActivity(events: DayEvent[]): boolean {
  return events.some(e => e.kind === 'pre_workday_activity');
}
