/**
 * Build a hierarchical "dagbok" for a single staff member's day:
 *
 *   ┌── Dagsrubrik (start)              ← workday.started_at OR earliest LTE/TR
 *   │     └── Projekt-session 1         ← merged time_reports + LTE per (booking|large_project)
 *   │           ├── Förflyttnings-flagga (om GPS visat tydligt skifte)
 *   │           └── Förflyttnings-flagga ...
 *   │     └── Projekt-session 2
 *   │     └── Resa
 *   └── Dagsrubrik (slut)               ← workday.ended_at OR latest end
 *
 * This module is pure — no DB calls. Movement flags are derived externally
 * (lazy, on expand) by `detectMovementSegments`. We only carry their refs
 * here as `MovementFlag[]` once the caller has computed them.
 *
 * Replaces the flat `DaySegment[]` model that produced one row per LTE
 * (the "Närvaro: FA Warehouse · 0h" spam from the screenshot).
 */

export type ProjectSessionKind = 'booking' | 'large_project' | 'location' | 'travel';

export interface ProjectSession {
  /** Stable key. Use `${kind}:${refId}`. */
  key: string;
  kind: ProjectSessionKind;
  label: string;
  /** Earliest start across all merged source rows (ISO). */
  start: string;
  /** Latest end across all merged source rows (ISO) or null if any open. */
  end: string | null;
  /** Sum of payable hours across merged rows. */
  hours: number;
  isOpen: boolean;
  /** Source row ids (for debug / linking). */
  sourceIds: string[];
  /** Optional address of the primary location (for the "öppna karta" link). */
  address?: string | null;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
}

export interface DayHeader {
  /** ISO of when the day visibly started/ended. Null if no data. */
  at: string | null;
  /** Best-effort address (`latestPing.address` or workday source). */
  address: string | null;
  /** True iff this header is "live" (only valid for end-header). */
  isOpen: boolean;
  /** Persisted admin comment from `workdays.admin_note`. */
  adminNote: string | null;
  /** Source workday id, if this header came from a workday row. */
  workdayId: string | null;
}

export interface StaffDayJournal {
  /** Day rubric — when the staff first appeared. */
  start: DayHeader;
  /** Day rubric — when they finished. `at=null` if still open. */
  end: DayHeader;
  /** Project / location / travel sessions, sorted by start time asc. */
  sessions: ProjectSession[];
  /** Sum of all payable hours for the day. */
  totalHours: number;
}

// ─── Inputs (mirror the shapes already fetched in StaffTimeReports.tsx) ─

export interface RawTimeReport {
  id: string;
  booking_id: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
  start_iso: string;
  end_iso: string | null;
  hours: number;
  /** Pre-resolved label from the caller (uses centralized resolver). */
  label?: string;
}

export interface RawLocationEntry {
  id: string;
  booking_id: string | null;
  large_project_id: string | null;
  location_id: string | null;
  entered_at: string;
  exited_at: string | null;
  hours: number;
  /** Resolved label (caller looks it up beforehand). */
  label: string;
  /** True if this LTE has no booking AND no large_project — passive presence. */
  isPresenceOnly: boolean;
}

export interface RawTravelLog {
  id: string;
  start_iso: string;
  end_iso: string | null;
  hours: number;
  to_address: string | null;
}

export interface RawWorkday {
  id: string;
  started_at: string;
  ended_at: string | null;
  admin_note: string | null;
}

export interface RawLatestPing {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
}

export interface BuildJournalInput {
  reports: RawTimeReport[];
  locationEntries: RawLocationEntry[];
  travel: RawTravelLog[];
  workdays: RawWorkday[];
  latestPing: RawLatestPing | null;
}

/**
 * Group payable rows into one ProjectSession per logical project. Multiple
 * fragmented `time_reports` for the same booking on the same day collapse
 * into one session whose `start`/`end` is the outer envelope.
 */
export function buildStaffDayJournal(input: BuildJournalInput): StaffDayJournal {
  const sessions = new Map<string, ProjectSession>();

  const upsert = (
    key: string,
    base: Omit<ProjectSession, 'sourceIds' | 'hours'> & { hours: number; sourceId: string },
  ) => {
    const existing = sessions.get(key);
    if (!existing) {
      sessions.set(key, {
        key,
        kind: base.kind,
        label: base.label,
        start: base.start,
        end: base.end,
        hours: base.hours,
        isOpen: base.isOpen,
        sourceIds: [base.sourceId],
        address: base.address ?? null,
        baseLatitude: base.baseLatitude ?? null,
        baseLongitude: base.baseLongitude ?? null,
      });
      return;
    }
    if (new Date(base.start).getTime() < new Date(existing.start).getTime()) {
      existing.start = base.start;
    }
    if (base.end === null) {
      existing.end = null;
      existing.isOpen = true;
    } else if (existing.end !== null) {
      if (new Date(base.end).getTime() > new Date(existing.end).getTime()) {
        existing.end = base.end;
      }
    }
    existing.hours += base.hours;
    existing.sourceIds.push(base.sourceId);
    if (!existing.address && base.address) existing.address = base.address;
  };

  // Time reports → keyed by (large_project | booking | location | id) so a
  // tidrapport without booking_id but with large_project_id still groups under
  // the correct project session and inherits its label from the caller.
  for (const r of input.reports) {
    const key = r.large_project_id
      ? `lp:${r.large_project_id}`
      : r.booking_id
        ? `booking:${r.booking_id}`
        : r.location_id
          ? `loc:${r.location_id}`
          : `tr:${r.id}`;
    const kind: ProjectSessionKind = r.large_project_id
      ? 'large_project'
      : r.location_id && !r.booking_id
        ? 'location'
        : 'booking';
    upsert(key, {
      key,
      kind,
      label: r.label || '', // filled by LTE if present; caller has booking-label fallback
      start: r.start_iso,
      end: r.end_iso,
      hours: r.hours,
      isOpen: !r.end_iso,
      sourceId: `tr:${r.id}`,
    });
  }

  // Location entries → presence-only is filtered out (used only for headers)
  for (const e of input.locationEntries) {
    if (e.isPresenceOnly) continue;
    const key = e.booking_id
      ? `booking:${e.booking_id}`
      : e.large_project_id
        ? `lp:${e.large_project_id}`
        : `loc:${e.location_id || e.id}`;
    const kind: ProjectSessionKind = e.booking_id
      ? 'booking'
      : e.large_project_id
        ? 'large_project'
        : 'location';
    upsert(key, {
      key,
      kind,
      label: e.label,
      start: e.entered_at,
      end: e.exited_at,
      hours: e.hours,
      isOpen: !e.exited_at,
      sourceId: `lt:${e.id}`,
    });
  }

  // Travel logs → one row per leg (don't merge — each is a discrete trip)
  for (const t of input.travel) {
    const key = `tv:${t.id}`;
    const dest = (t.to_address || '').split(',')[0].trim();
    upsert(key, {
      key,
      kind: 'travel',
      label: dest ? `Resa → ${dest}` : 'Resa',
      start: t.start_iso,
      end: t.end_iso,
      hours: t.hours,
      isOpen: !t.end_iso,
      sourceId: `tv:${t.id}`,
    });
  }

  // Patch labels: if a session lacks a label, take it from any matching source label
  for (const s of sessions.values()) {
    if (s.label) continue;
    if (s.kind === 'booking' && s.key.startsWith('booking:')) {
      const bId = s.key.slice('booking:'.length);
      const lte = input.locationEntries.find(e => e.booking_id === bId && e.label);
      if (lte) s.label = lte.label;
    }
  }

  // Find day-start: prefer earliest workday.started_at, fallback to earliest session start, fallback to earliest presence-only LTE.
  const presenceLTEs = input.locationEntries.filter(e => e.isPresenceOnly);
  const workdayStart = input.workdays
    .map(w => w.started_at)
    .sort()[0] || null;
  const sessionStart = [...sessions.values()]
    .map(s => s.start)
    .sort()[0] || null;
  const presenceStart = presenceLTEs
    .map(e => e.entered_at)
    .sort()[0] || null;
  const firstStart =
    [workdayStart, sessionStart, presenceStart].filter(Boolean).sort()[0] || null;

  // Workday end (only meaningful if there is a closed workday).
  const closedWorkdays = input.workdays.filter(w => w.ended_at);
  const workdayEnd = closedWorkdays
    .map(w => w.ended_at!)
    .sort()
    .reverse()[0] || null;

  const sessionMaxEnd = (() => {
    let latest: string | null = null;
    for (const s of [...sessions.values(), ...presenceLTEs.map(p => ({ end: p.exited_at }))]) {
      if (!s.end) return null; // open → no end yet
      if (!latest || new Date(s.end).getTime() > new Date(latest).getTime()) {
        latest = s.end;
      }
    }
    return latest;
  })();

  const anyOpen = [...sessions.values()].some(s => s.isOpen) ||
    presenceLTEs.some(p => !p.exited_at) ||
    input.workdays.some(w => !w.ended_at);

  const startWorkday = input.workdays
    .filter(w => w.started_at === workdayStart)[0] || null;
  const endWorkday = input.workdays
    .filter(w => w.ended_at === workdayEnd)[0] || null;

  const start: DayHeader = {
    at: firstStart,
    address: input.latestPing?.address ?? null,
    isOpen: false,
    adminNote: startWorkday?.admin_note ?? null,
    workdayId: startWorkday?.id ?? null,
  };

  const end: DayHeader = {
    at: anyOpen ? null : (workdayEnd || sessionMaxEnd),
    address: input.latestPing?.address ?? null,
    isOpen: anyOpen,
    adminNote: endWorkday?.admin_note ?? null,
    workdayId: endWorkday?.id ?? null,
  };

  const sortedSessions = [...sessions.values()].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const totalHours = sortedSessions.reduce((sum, s) => sum + s.hours, 0);

  return { start, end, sessions: sortedSessions, totalHours };
}
