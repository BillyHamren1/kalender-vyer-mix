/**
 * dayEventLog — bygger en kronologisk händelselogg för en personal/dag.
 *
 * Källor:
 *   • DayReality (sessions, pings, workday)  — vad som faktiskt hände
 *   • workday_flags                          — vilka frågor systemet ställt
 *
 * Returnerar tre lager:
 *   1. events  — kronologisk timeline (start, ankomst, lämnade, resa, slut)
 *   2. interpretations — regelbaserade tolkningar ("varit på FA Warehouse 7h")
 *   3. suggestions — föreslagna åtgärder ("Flytta rapport till FA Warehouse")
 *   4. notifications — frågor systemet ställt + svar
 */
import type { DayReality, RealityFlag, SessionReality } from '@/hooks/useStaffDayReality';

export type EventKind =
  | 'day_start'
  | 'day_end'
  | 'site_arrived'
  | 'site_left'
  | 'session_start'
  | 'session_end'
  | 'gps_gap'
  | 'travel'
  | 'still_on_site';

export interface DayEvent {
  at: string;             // ISO
  until?: string | null;  // for ranges (gap, travel)
  kind: EventKind;
  label: string;          // "Startade arbetsdag", "Ankom FA Warehouse"
  detail?: string;        // "David Adrians väg, Upplands Väsby"
  severity: 'info' | 'success' | 'warning' | 'critical';
  sessionId?: string | null;
  durationMin?: number;
}

export type SuggestionAction =
  | 'move_report_to_actual_site'
  | 'split_report_at_gap'
  | 'close_open_session'
  | 'add_break'
  | 'review_travel';

export interface DaySuggestion {
  action: SuggestionAction;
  label: string;          // "Flytta tidrapport till FA Warehouse"
  rationale: string;      // human-readable
  severity: 'info' | 'warning' | 'critical';
  sessionId?: string | null;
  payload?: Record<string, unknown>;
}

export interface DayInterpretation {
  text: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
}

export interface NotificationEntry {
  id: string;
  at: string;            // when the notification was raised
  question: string;      // title
  detail?: string | null;
  severity: 'info' | 'warning' | 'critical';
  flagType: string;
  needsUserInput: boolean;
  resolved: boolean;
  resolvedAt?: string | null;
  answer?: string | null;        // resolution_note
  answerSource?: 'staff' | 'admin' | 'auto' | null;
}

export interface DayEventLog {
  events: DayEvent[];
  interpretations: DayInterpretation[];
  suggestions: DaySuggestion[];
  notifications: NotificationEntry[];
}

const fmtDur = (min: number): string => {
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/** Normalise a raw workday_flag row into a notification entry. */
export const flagToNotification = (f: any): NotificationEntry => ({
  id: String(f.id),
  at: f.created_at,
  question: f.title || f.flag_type || 'Notis',
  detail: f.description || null,
  severity: (f.severity as any) || 'warning',
  flagType: f.flag_type,
  needsUserInput: !!f.needs_user_input,
  resolved: !!f.resolved,
  resolvedAt: f.resolved_at || null,
  answer: f.resolution_note || null,
  answerSource: (f.resolution_source as any) || null,
});

/** Build the chronological event timeline from DayReality. */
const buildEvents = (reality: DayReality): DayEvent[] => {
  const events: DayEvent[] = [];

  // Day start
  if (reality.workday?.started_at) {
    events.push({
      at: reality.workday.started_at,
      kind: 'day_start',
      label: 'Startade arbetsdag',
      detail: reality.first_ping
        ? `${reality.first_ping.lat.toFixed(4)}, ${reality.first_ping.lng.toFixed(4)}`
        : undefined,
      severity: 'success',
    });
  }

  // Sessions: start + arrival + departure + end
  for (const s of reality.sessions) {
    const isLocation = s.kind === 'location_entry';
    const verb = isLocation ? 'Ankom' : 'Startade';
    events.push({
      at: s.start,
      kind: isLocation ? 'site_arrived' : 'session_start',
      label: `${verb} ${s.label}`,
      severity: 'info',
      sessionId: s.session_id,
    });

    // Last seen at site (for sessions where we tracked presence)
    if (s.left_reported_site_at) {
      events.push({
        at: s.left_reported_site_at,
        kind: 'site_left',
        label: `Lämnade ${s.label}`,
        severity: 'info',
        sessionId: s.session_id,
      });
    }

    // Session end (closed only)
    if (s.end && !s.is_open) {
      events.push({
        at: s.end,
        kind: isLocation ? 'site_left' : 'session_end',
        label: `Avslutade ${s.label}`,
        detail: `${fmtDur(s.duration_min)} totalt`,
        severity: 'info',
        sessionId: s.session_id,
        durationMin: s.duration_min,
      });
    }

    // Open session "still here" event = current time mark
    if (s.is_open) {
      events.push({
        at: s.current_position?.recorded_at || s.start,
        kind: 'still_on_site',
        label: `Pågår vid ${s.label}`,
        detail: s.current_distance_to_reported_site != null
          ? `${s.current_distance_to_reported_site} m från rapporterad plats`
          : undefined,
        severity: 'warning',
        sessionId: s.session_id,
        durationMin: s.duration_min,
      });
    }

    // GPS gaps inside this session — surface as their own event
    for (const f of s.flags) {
      if (f.type === 'gps_gap' && f.at && f.until) {
        events.push({
          at: f.at,
          until: f.until,
          kind: 'gps_gap',
          label: 'GPS-glapp',
          detail: f.message,
          severity: f.severity === 'critical' ? 'critical' : 'warning',
          sessionId: s.session_id,
          durationMin: f.durationMin,
        });
      }
    }
  }

  // Day end
  if (reality.workday?.ended_at) {
    events.push({
      at: reality.workday.ended_at,
      kind: 'day_end',
      label: 'Avslutade arbetsdag',
      severity: 'success',
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
};

/** Build human-readable interpretations from sessions + flags. */
const buildInterpretations = (reality: DayReality): DayInterpretation[] => {
  const out: DayInterpretation[] = [];

  // Per-session: time-on-site verdict
  for (const s of reality.sessions) {
    if (s.kind === 'location_entry' && s.duration_min > 0) {
      out.push({
        text: `Var på ${s.label} i ${fmtDur(s.duration_min)} (${s.pings_at_site} av ${s.pings_in_session} pings inne på platsen).`,
        severity: 'success',
      });
    }

    const wrong = s.flags.find((f) => f.type === 'wrong_reported_site');
    if (wrong && wrong.detail) {
      const actual = (wrong.detail.actual_site as any)?.label;
      out.push({
        text: `Tidrapporten är märkt "${s.label}" men personen verkar ha varit på "${actual}" hela tiden.`,
        severity: 'warning',
      });
    }

    const never = s.flags.find((f) => f.type === 'never_at_reported_site');
    if (never) out.push({ text: never.message, severity: 'critical' });

    const overrun = s.flags.find((f) => f.type === 'report_overrun_after_departure');
    if (overrun) out.push({ text: overrun.message, severity: 'warning' });
  }

  // Day-level
  for (const f of reality.flags) {
    out.push({
      text: f.message,
      severity: f.severity === 'critical' ? 'critical' : 'warning',
    });
  }

  if (out.length === 0) {
    out.push({
      text: `GPS bekräftar rapporterad tid · ${reality.gps_points_count} pings granskade.`,
      severity: 'success',
    });
  }
  return out;
};

/** Derive concrete next-step suggestions from flags. */
const buildSuggestions = (reality: DayReality): DaySuggestion[] => {
  const out: DaySuggestion[] = [];

  for (const s of reality.sessions) {
    const wrong = s.flags.find((f) => f.type === 'wrong_reported_site');
    if (wrong) {
      const actual = wrong.detail?.actual_site as any;
      out.push({
        action: 'move_report_to_actual_site',
        label: `Flytta rapport "${s.label}" till "${actual?.label}"`,
        rationale: `${actual?.pings} pings vid ${actual?.label} mot ${(wrong.detail?.reported_target as any)?.pings} pings vid ${s.label}.`,
        severity: 'warning',
        sessionId: s.session_id,
        payload: { from: s.target_id, to: actual?.id, toType: actual?.type },
      });
    }

    const longGap = s.flags.find((f) => f.type === 'gps_gap' && (f.durationMin ?? 0) >= 60);
    if (longGap) {
      out.push({
        action: 'split_report_at_gap',
        label: `Granska GPS-glapp ${fmtDur(longGap.durationMin || 0)} under ${s.label}`,
        rationale: longGap.message,
        severity: 'warning',
        sessionId: s.session_id,
      });
    }

    if (s.is_open && s.left_reported_site_at) {
      out.push({
        action: 'close_open_session',
        label: `Stäng öppen timer för ${s.label}`,
        rationale: `Personen lämnade platsen ${new Date(s.left_reported_site_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} men timern är fortfarande igång.`,
        severity: 'critical',
        sessionId: s.session_id,
      });
    }
  }

  // Day total > 5h with no break → suggest break (workday_flags will likely have missing_break too)
  const totalMin = reality.sessions
    .filter((s) => s.kind !== 'location_entry')
    .reduce((n, s) => n + s.duration_min, 0);
  if (totalMin >= 5 * 60) {
    // Only suggest if no other suggestion already covers it
    out.push({
      action: 'add_break',
      label: 'Verifiera att rast registrerats',
      rationale: `Total arbetstid ${fmtDur(totalMin)} — kontrollera mot rastregler.`,
      severity: 'info',
    });
  }

  return out;
};

export const buildDayEventLog = (
  reality: DayReality | null | undefined,
  flags: any[] = [],
): DayEventLog => {
  if (!reality) {
    return { events: [], interpretations: [], suggestions: [], notifications: flags.map(flagToNotification) };
  }
  return {
    events: buildEvents(reality),
    interpretations: buildInterpretations(reality),
    suggestions: buildSuggestions(reality),
    notifications: flags
      .map(flagToNotification)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
  };
};
