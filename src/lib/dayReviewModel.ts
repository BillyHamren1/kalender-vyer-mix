/**
 * dayReviewModel — pure derivation of admin day-review data.
 *
 * Combines raw inputs (workday, planned stops, work entries, travel
 * segments) into a normalized timeline model with:
 *   - bars (workday | planned | actual | travel | gap)
 *   - anomalies (late/overrun/missing-end/unallocated/etc.)
 *   - row breakdown (project / travel / location / break)
 *
 * All times are ISO strings; the model only deals with ms timestamps so
 * timezone is the consumer's concern. Pure / no I/O.
 */

import { parsePlannerDateTime } from '@/utils/dateUtils';

export interface DayReviewWorkday {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  review_status: 'draft' | 'needs_review' | 'ready' | 'approved' | 'returned';
  review_note?: string | null;
}

export interface PlannedStop {
  bookingId: string;
  client: string;
  startTime: string | null;
  endTime: string | null;
  eventType?: string | null;
  largeProjectId?: string | null;
}

export interface WorkEntryInput {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  booking_client: string;
  booking_id?: string | null;
  booking_number: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
  description: string | null;
  ongoing?: boolean;
}

export interface TravelSegmentInput {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  from_address: string | null;
  to_address: string | null;
  destination_booking_id: string | null;
  needs_review?: boolean;
}

export type BarKind = 'workday' | 'planned' | 'actual' | 'travel' | 'gap';

export interface TimelineBar {
  kind: BarKind;
  startMs: number;
  endMs: number;
  label: string;
  sublabel?: string;
  /** Source row id when the bar represents a single entity (work/travel). */
  refId?: string;
  /** Soft warning attached to this bar (e.g. "kvar efter planerat slut"). */
  warning?: string;
}

export type AnomalyKind =
  | 'late_start'
  | 'overrun_planned_end'
  | 'missing_end'
  | 'unallocated_time'
  | 'suspicious_travel'
  | 'overlap'
  | 'gps_uncertainty'
  | 'pending_assistant'
  | 'no_workday';

export interface Anomaly {
  kind: AnomalyKind;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  /** ms range when applicable. */
  startMs?: number;
  endMs?: number;
}

export type RowKind = 'project' | 'travel' | 'location' | 'break';

export interface DayRow {
  kind: RowKind;
  refId: string;
  label: string;
  startMs: number | null;
  endMs: number | null;
  hours: number;
  ongoing?: boolean;
}

export interface DayReviewModel {
  /** Bounds for the timeline (covers planned + actual + workday + 1h padding). */
  windowStartMs: number;
  windowEndMs: number;
  bars: TimelineBar[];
  anomalies: Anomaly[];
  rows: DayRow[];
  totals: {
    workMinutes: number;
    travelMinutes: number;
    workdayMinutes: number;
    plannedMinutes: number;
    unallocatedMinutes: number;
  };
}

const HOUR = 3_600_000;

function toMs(iso: string | null | undefined, dateKey?: string): number | null {
  if (!iso) return null;
  // Bare HH:MM(:SS) — combine with the day key.
  if (!iso.includes('T') && /^\d{2}:\d{2}/.test(iso) && dateKey) {
    const padded = iso.length === 5 ? `${iso}:00` : iso;
    const t = new Date(`${dateKey}T${padded}`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = parsePlannerDateTime(iso) ?? (iso ? new Date(iso) : null);
  if (!d) return null;
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function minutesBetween(a: number, b: number): number {
  return Math.max(0, Math.round((b - a) / 60000));
}

interface BuildArgs {
  dateKey: string; // YYYY-MM-DD
  workday: DayReviewWorkday | null;
  plannedStops: PlannedStop[];
  workEntries: WorkEntryInput[];
  travelSegments: TravelSegmentInput[];
  pendingAssistantCount?: number;
}

export function buildDayReviewModel(args: BuildArgs): DayReviewModel {
  const { dateKey, workday, plannedStops, workEntries, travelSegments } = args;

  const dayStartMs = new Date(`${dateKey}T00:00:00`).getTime();
  const dayEndMs = dayStartMs + 24 * HOUR;

  const bars: TimelineBar[] = [];
  const anomalies: Anomaly[] = [];
  const rows: DayRow[] = [];

  // ── Workday bar ────────────────────────────────────────────────────
  const wdStart = toMs(workday?.started_at);
  const wdEnd = toMs(workday?.ended_at);
  if (wdStart) {
    bars.push({
      kind: 'workday',
      startMs: wdStart,
      endMs: wdEnd ?? Math.min(Date.now(), dayEndMs),
      label: 'Arbetsdag',
      warning: !wdEnd ? 'saknar utloggning' : undefined,
    });
    if (!wdEnd) {
      anomalies.push({
        kind: 'missing_end',
        severity: 'critical',
        title: 'Saknar utloggning',
        detail: 'Arbetsdagen har ingen sluttid.',
        startMs: wdStart,
      });
    }
  } else {
    anomalies.push({
      kind: 'no_workday',
      severity: 'warn',
      title: 'Ingen arbetsdag startad',
      detail: 'Personalen har inte startat dagen i appen.',
    });
  }

  // ── Planned bars ──────────────────────────────────────────────────
  let earliestPlanned = Infinity;
  let latestPlanned = -Infinity;
  for (const p of plannedStops) {
    const ps = toMs(p.startTime, dateKey);
    const pe = toMs(p.endTime, dateKey);
    if (ps == null || pe == null) continue;
    earliestPlanned = Math.min(earliestPlanned, ps);
    latestPlanned = Math.max(latestPlanned, pe);
    bars.push({
      kind: 'planned',
      startMs: ps,
      endMs: pe,
      label: p.client,
      sublabel: p.eventType ?? undefined,
      refId: p.bookingId,
    });
  }

  // ── Actual work bars + rows ───────────────────────────────────────
  let earliestActual = Infinity;
  let latestActual = -Infinity;
  let workMinutes = 0;
  for (const w of workEntries) {
    const ws = toMs(w.start_time, dateKey);
    const we = toMs(w.end_time, dateKey) ?? (w.ongoing ? Date.now() : null);
    if (ws == null || we == null) continue;
    earliestActual = Math.min(earliestActual, ws);
    latestActual = Math.max(latestActual, we);
    workMinutes += minutesBetween(ws, we);

    let warning: string | undefined;
    // Late start / overrun against planned (matched by booking id).
    const plan = plannedStops.find((p) => p.bookingId === w.booking_id);
    if (plan) {
      const ps = toMs(plan.startTime, dateKey);
      const pe = toMs(plan.endTime, dateKey);
      if (ps != null && ws - ps > 15 * 60_000) {
        warning = `kom ${minutesBetween(ps, ws)} min sent`;
        anomalies.push({
          kind: 'late_start',
          severity: 'warn',
          title: `Sen ankomst — ${plan.client}`,
          detail: `Planerat ${new Date(ps).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}, faktiskt ${new Date(ws).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.`,
          startMs: ws,
        });
      }
      if (pe != null && we - pe > 15 * 60_000 && !w.ongoing) {
        anomalies.push({
          kind: 'overrun_planned_end',
          severity: 'warn',
          title: `Kvar efter planerat slut — ${plan.client}`,
          detail: `Planerat slut ${new Date(pe).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}, faktiskt slut ${new Date(we).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.`,
          startMs: pe,
          endMs: we,
        });
      }
    }
    if (w.ongoing) {
      anomalies.push({
        kind: 'missing_end',
        severity: 'warn',
        title: `Pågående aktivitet — ${w.booking_client}`,
        detail: 'Aktiviteten har ingen utloggning ännu.',
        startMs: ws,
      });
    }

    bars.push({
      kind: 'actual',
      startMs: ws,
      endMs: we,
      label: w.booking_client,
      sublabel: w.booking_number ? `#${w.booking_number}` : undefined,
      refId: w.id,
      warning,
    });

    rows.push({
      kind: w.location_id ? 'location' : 'project',
      refId: w.id,
      label: w.booking_client,
      startMs: ws,
      endMs: we,
      hours: w.hours_worked,
      ongoing: w.ongoing,
    });
  }

  // ── Travel bars + rows ────────────────────────────────────────────
  let travelMinutes = 0;
  for (const tr of travelSegments) {
    const ts = toMs(tr.start_time, dateKey);
    const te = toMs(tr.end_time, dateKey);
    if (ts == null || te == null) continue;
    travelMinutes += minutesBetween(ts, te);
    bars.push({
      kind: 'travel',
      startMs: ts,
      endMs: te,
      label: [tr.from_address, tr.to_address].filter(Boolean).join(' → ') || 'Resa',
      refId: tr.id,
      warning: tr.needs_review ? 'misstänkt restid' : undefined,
    });
    if (tr.needs_review) {
      anomalies.push({
        kind: 'suspicious_travel',
        severity: 'warn',
        title: 'Misstänkt restid',
        detail: `Resan ${minutesBetween(ts, te)} min behöver granskas.`,
        startMs: ts,
        endMs: te,
      });
    }
    rows.push({
      kind: 'travel',
      refId: tr.id,
      label: [tr.from_address, tr.to_address].filter(Boolean).join(' → ') || 'Resa',
      startMs: ts,
      endMs: te,
      hours: tr.hours_worked,
    });
  }

  // ── Overlap detection (work vs work) ─────────────────────────────
  const sortedActual = bars.filter((b) => b.kind === 'actual').sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < sortedActual.length; i++) {
    const prev = sortedActual[i - 1];
    const cur = sortedActual[i];
    if (cur.startMs < prev.endMs - 60_000) {
      anomalies.push({
        kind: 'overlap',
        severity: 'critical',
        title: 'Överlappande aktiviteter',
        detail: `${prev.label} och ${cur.label} överlappar.`,
        startMs: cur.startMs,
        endMs: Math.min(prev.endMs, cur.endMs),
      });
    }
  }

  // ── Gap detection inside workday ─────────────────────────────────
  let unallocatedMinutes = 0;
  if (wdStart) {
    const wdStop = wdEnd ?? Math.min(Date.now(), dayEndMs);
    const allocated = [
      ...bars.filter((b) => b.kind === 'actual' || b.kind === 'travel'),
    ].sort((a, b) => a.startMs - b.startMs);

    let cursor = wdStart;
    for (const seg of allocated) {
      if (seg.startMs > cursor + 5 * 60_000) {
        const gapStart = cursor;
        const gapEnd = Math.min(seg.startMs, wdStop);
        const gapMin = minutesBetween(gapStart, gapEnd);
        unallocatedMinutes += gapMin;
        bars.push({
          kind: 'gap',
          startMs: gapStart,
          endMs: gapEnd,
          label: `Lucka ${gapMin} min`,
          warning: 'oallokerad tid',
        });
        anomalies.push({
          kind: 'unallocated_time',
          severity: gapMin > 60 ? 'warn' : 'info',
          title: `Oallokerad tid (${gapMin} min)`,
          detail: 'Tid mellan aktiviteter som inte är restid eller jobb.',
          startMs: gapStart,
          endMs: gapEnd,
        });
      }
      cursor = Math.max(cursor, seg.endMs);
    }
    if (cursor < wdStop - 5 * 60_000) {
      const gapMin = minutesBetween(cursor, wdStop);
      unallocatedMinutes += gapMin;
      bars.push({
        kind: 'gap',
        startMs: cursor,
        endMs: wdStop,
        label: `Lucka ${gapMin} min`,
        warning: 'oallokerad tid efter sista aktivitet',
      });
      anomalies.push({
        kind: 'unallocated_time',
        severity: gapMin > 60 ? 'warn' : 'info',
        title: `Oallokerad tid efter sista aktivitet (${gapMin} min)`,
        startMs: cursor,
        endMs: wdStop,
      });
    }
  }

  // ── Pending assistant events ─────────────────────────────────────
  if ((args.pendingAssistantCount ?? 0) > 0) {
    anomalies.push({
      kind: 'pending_assistant',
      severity: 'warn',
      title: `${args.pendingAssistantCount} obesvarade assistant-event`,
      detail: 'Personalen har frågor från workday-assistenten som inte är besvarade.',
    });
  }

  // ── Window bounds ────────────────────────────────────────────────
  let windowStartMs = Math.min(
    wdStart ?? Infinity,
    earliestPlanned,
    earliestActual,
  );
  let windowEndMs = Math.max(
    wdEnd ?? -Infinity,
    latestPlanned,
    latestActual,
  );
  if (!Number.isFinite(windowStartMs)) windowStartMs = dayStartMs + 6 * HOUR;
  if (!Number.isFinite(windowEndMs)) windowEndMs = dayStartMs + 18 * HOUR;
  // Pad 30 min on each side and snap to whole hours.
  windowStartMs = new Date(windowStartMs - 30 * 60_000).setMinutes(0, 0, 0);
  const padEnd = new Date(windowEndMs + 30 * 60_000);
  padEnd.setMinutes(padEnd.getMinutes() > 0 ? 60 : 0, 0, 0);
  windowEndMs = padEnd.getTime();
  if (windowEndMs - windowStartMs < 4 * HOUR) windowEndMs = windowStartMs + 4 * HOUR;

  const workdayMinutes = wdStart ? minutesBetween(wdStart, wdEnd ?? Date.now()) : 0;
  const plannedMinutes = Number.isFinite(earliestPlanned) && Number.isFinite(latestPlanned)
    ? minutesBetween(earliestPlanned, latestPlanned)
    : 0;

  rows.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  return {
    windowStartMs,
    windowEndMs,
    bars,
    anomalies,
    rows,
    totals: {
      workMinutes,
      travelMinutes,
      workdayMinutes,
      plannedMinutes,
      unallocatedMinutes,
    },
  };
}
