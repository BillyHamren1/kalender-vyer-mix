// _shared/dayReality.ts
// ----------------------------------------------------------------------------
// Pure server-side analysis engine that turns raw GPS pings + reported
// sessions into a factual "reality summary" for ONE staff member on ONE day.
//
// Zero I/O — caller fetches data and feeds it in. Used by the
// `get_staff_day_reality` action in mobile-app-api so admin UIs can render
// authoritative facts (timer started where, last seen at site when, etc.)
// instead of guessing client-side.
//
// Flag types (matches PROMPT 1 spec):
//   - missing_gps                    no GPS pings at all in the day window
//   - timer_started_offsite          1st ping after start was >threshold from site
//   - never_at_reported_site         no ping inside threshold during the report
//   - left_site_timer_still_open     OPEN report, last presence at site is old
//   - report_overrun_after_departure CLOSED report, end >> last on-site ping
//   - stale_phone                    OPEN report, no recent ping at all
//   - wrong_reported_site            staff spent majority of time at a DIFFERENT
//                                    known site than the one reported
//   - gps_gap                        long stretch (default ≥30 min) with no
//                                    pings DURING the reported window
// ----------------------------------------------------------------------------

export type FlagType =
  | 'missing_gps'
  | 'timer_started_offsite'
  | 'never_at_reported_site'
  | 'left_site_timer_still_open'
  | 'report_overrun_after_departure'
  | 'stale_phone'
  | 'wrong_reported_site'
  | 'gps_gap';

export type FlagSeverity = 'info' | 'warning' | 'critical';

export interface RealityFlag {
  type: FlagType;
  severity: FlagSeverity;
  /** When the issue is first observable. */
  at: string | null;
  /** End of the affected period (for periods). */
  until?: string | null;
  /** Duration in minutes, when meaningful. */
  durationMin?: number;
  /** Human-readable Swedish summary. */
  message: string;
  /** Optional structured detail bag for UI (distances, coords, ids…). */
  detail?: Record<string, unknown>;
  /** Which session this flag belongs to (or null = day-level). */
  sessionId?: string | null;
}

export interface RealityPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
}

export type SessionKind = 'time_report' | 'location_entry';

export interface RealitySessionInput {
  /** Stable id (time_reports.id or location_time_entries.id). */
  id: string;
  kind: SessionKind;
  /** ISO start (when the timer started). */
  start: string;
  /** ISO end (null = OPEN / running). */
  end: string | null;
  /** Short label for messages (e.g. "FA Warehouse" or "Booking #1234"). */
  label: string;
  /** Reported target id (booking_id / large_project_id / location_id). */
  targetType: 'booking' | 'large_project' | 'location' | 'unknown';
  targetId: string | null;
  /** Reported site coordinates (if known). May be null. */
  site: { lat: number; lng: number; radiusMeters?: number | null } | null;
}

export interface RealityWorkday {
  id: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface KnownSite {
  /** booking_id, large_project_id or organization_locations.id */
  id: string;
  type: 'booking' | 'large_project' | 'location';
  label: string;
  lat: number;
  lng: number;
  radiusMeters?: number | null;
}

export interface DayRealityInput {
  staffId: string;
  /** Calendar date (YYYY-MM-DD) the analysis is for. Used for window. */
  date: string;
  /** "Now" in ISO — injectable for tests. Defaults to new Date(). */
  nowIso?: string;
  pings: RealityPing[];
  sessions: RealitySessionInput[];
  workday: RealityWorkday | null;
  /** All known sites for the org — used to detect wrong_reported_site. */
  knownSites?: KnownSite[];

  /** Default radius (m) for "at site" when a site has no explicit radius. */
  defaultRadiusMeters?: number;
  /** Minutes without ping that count as a gps_gap inside a session. */
  gapMinutes?: number;
  /** Minutes without ping that flip stale_phone for an open report. */
  staleMinutes?: number;
}

export interface SessionReality {
  session_id: string;
  kind: SessionKind;
  label: string;
  target_type: RealitySessionInput['targetType'];
  target_id: string | null;
  start: string;
  end: string | null;
  is_open: boolean;
  duration_min: number;

  /** Where the timer started (closest ping to start). null if no GPS. */
  timer_start_position: { lat: number; lng: number; recorded_at: string } | null;
  /** Distance (m) from timer_start_position to the reported site. */
  timer_start_distance_to_reported_site: number | null;
  timer_started_offsite: boolean;

  /** Last ping timestamp where staff was inside the site radius. */
  last_seen_at_reported_site: string | null;
  /** First ping AFTER `last_seen_at_reported_site` that is OUTSIDE radius. */
  left_reported_site_at: string | null;

  /** Latest ping anywhere inside the session window (or after, if open). */
  current_position: { lat: number; lng: number; recorded_at: string } | null;
  current_distance_to_reported_site: number | null;

  /** Total ping count inside (start, end ?? now). */
  pings_in_session: number;
  /** Of those, how many were inside the site radius. */
  pings_at_site: number;

  flags: RealityFlag[];
}

export interface DayReality {
  staff_id: string;
  date: string;
  generated_at: string;
  workday: RealityWorkday | null;
  gps_points_count: number;
  first_ping: RealityPing | null;
  last_ping: RealityPing | null;
  sessions: SessionReality[];
  /** Day-level flags (missing_gps, stale_phone for the day). */
  flags: RealityFlag[];
}

// ─── helpers ───────────────────────────────────────────────────────────────

const MS_PER_MIN = 60_000;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_MIN);
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function sortByTime<T extends { recorded_at: string }>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

function findClosestPing(
  pings: RealityPing[],
  iso: string,
  toleranceMin = 10,
): RealityPing | null {
  if (!pings.length) return null;
  const targetMs = new Date(iso).getTime();
  let best: RealityPing | null = null;
  let bestDelta = Infinity;
  for (const p of pings) {
    const delta = Math.abs(new Date(p.recorded_at).getTime() - targetMs);
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return bestDelta <= toleranceMin * MS_PER_MIN ? best : null;
}

// ─── core ──────────────────────────────────────────────────────────────────

export function buildDayReality(input: DayRealityInput): DayReality {
  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const nowIso = now.toISOString();
  const defaultRadius = input.defaultRadiusMeters ?? 200;
  const gapMinutes = input.gapMinutes ?? 30;
  const staleMinutes = input.staleMinutes ?? 15;

  const pings = sortByTime(input.pings || []);
  const dayFlags: RealityFlag[] = [];

  // ── Day-level: missing GPS
  if (pings.length === 0) {
    dayFlags.push({
      type: 'missing_gps',
      severity: 'critical',
      at: input.date + 'T00:00:00.000Z',
      message: 'Inga GPS-pings registrerade under dagen',
    });
  }

  const firstPing = pings[0] ?? null;
  const lastPing = pings[pings.length - 1] ?? null;

  // ── Day-level: stale_phone (only meaningful if any session is open)
  const anyOpen = (input.sessions || []).some((s) => !s.end);
  if (anyOpen && lastPing) {
    const ageMin = minutesBetween(lastPing.recorded_at, nowIso);
    if (ageMin >= staleMinutes) {
      dayFlags.push({
        type: 'stale_phone',
        severity: ageMin >= 60 ? 'critical' : 'warning',
        at: lastPing.recorded_at,
        durationMin: ageMin,
        message: `Telefonen har inte skickat ping på ${ageMin} min`,
        detail: { last_ping_at: lastPing.recorded_at },
      });
    }
  } else if (anyOpen && !lastPing) {
    dayFlags.push({
      type: 'stale_phone',
      severity: 'critical',
      at: null,
      message: 'Öppen timer, men inga pings finns alls för dagen',
    });
  }

  const sessions: SessionReality[] = [];

  for (const s of input.sessions || []) {
    const sessionFlags: RealityFlag[] = [];
    const startMs = new Date(s.start).getTime();
    const endMs = s.end ? new Date(s.end).getTime() : now.getTime();
    const isOpen = !s.end;
    const duration = Math.max(0, Math.round((endMs - startMs) / MS_PER_MIN));

    const pingsInWindow = pings.filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });

    // Pings AT site (only meaningful when site coords known).
    const radius = s.site?.radiusMeters ?? defaultRadius;
    const pingsAtSite: RealityPing[] = s.site
      ? pingsInWindow.filter(
          (p) => haversineMeters(s.site!, { lat: p.lat, lng: p.lng }) <= radius,
        )
      : [];

    // ── timer_start_position: closest ping within ±10 min of start
    const startPing = findClosestPing(pings, s.start, 10);
    const startPos = startPing
      ? { lat: startPing.lat, lng: startPing.lng, recorded_at: startPing.recorded_at }
      : null;
    const startDist =
      startPos && s.site
        ? Math.round(haversineMeters(s.site, startPos))
        : null;

    let timerStartedOffsite = false;
    if (s.site && startPos && startDist != null && startDist > radius) {
      timerStartedOffsite = true;
      sessionFlags.push({
        type: 'timer_started_offsite',
        severity: startDist > radius * 5 ? 'critical' : 'warning',
        at: s.start,
        message: `Timer startade ${startDist} m från ${s.label}`,
        detail: { distance_m: startDist, radius_m: radius },
        sessionId: s.id,
      });
    }

    // ── presence at site
    const lastSeenAtSite =
      pingsAtSite.length > 0
        ? pingsAtSite[pingsAtSite.length - 1].recorded_at
        : null;

    // First ping AFTER lastSeenAtSite that's outside radius => "left at"
    let leftAt: string | null = null;
    if (lastSeenAtSite && s.site) {
      const lastSeenMs = new Date(lastSeenAtSite).getTime();
      const after = pings.find((p) => {
        const t = new Date(p.recorded_at).getTime();
        return (
          t > lastSeenMs &&
          haversineMeters(s.site!, { lat: p.lat, lng: p.lng }) > radius
        );
      });
      leftAt = after?.recorded_at ?? null;
    }

    // ── never_at_reported_site
    if (s.site && pingsInWindow.length > 0 && pingsAtSite.length === 0) {
      sessionFlags.push({
        type: 'never_at_reported_site',
        severity: 'critical',
        at: s.start,
        until: s.end,
        durationMin: duration,
        message: `GPS visar att personen aldrig var inom ${radius} m från ${s.label}`,
        detail: { radius_m: radius, pings_in_window: pingsInWindow.length },
        sessionId: s.id,
      });
    }

    // ── left_site_timer_still_open
    if (
      isOpen &&
      s.site &&
      lastSeenAtSite &&
      minutesBetween(lastSeenAtSite, nowIso) >= staleMinutes
    ) {
      const goneMin = minutesBetween(lastSeenAtSite, nowIso);
      sessionFlags.push({
        type: 'left_site_timer_still_open',
        severity: goneMin >= 60 ? 'critical' : 'warning',
        at: leftAt ?? lastSeenAtSite,
        durationMin: goneMin,
        message: `Timer är öppen men personen har inte synts på ${s.label} på ${goneMin} min`,
        detail: {
          last_seen_at_site: lastSeenAtSite,
          left_at: leftAt,
          gone_min: goneMin,
        },
        sessionId: s.id,
      });
    }

    // ── report_overrun_after_departure (closed reports only)
    if (!isOpen && s.site && lastSeenAtSite && s.end) {
      const overrun = minutesBetween(lastSeenAtSite, s.end);
      if (overrun >= 30) {
        sessionFlags.push({
          type: 'report_overrun_after_departure',
          severity: overrun >= 120 ? 'critical' : 'warning',
          at: lastSeenAtSite,
          until: s.end,
          durationMin: overrun,
          message: `Rapporten stängdes ${overrun} min efter sista närvaro vid ${s.label}`,
          detail: { last_seen_at_site: lastSeenAtSite, reported_end: s.end },
          sessionId: s.id,
        });
      }
    }

    // ── gps_gap inside the session window
    if (pingsInWindow.length >= 2) {
      for (let i = 1; i < pingsInWindow.length; i++) {
        const a = new Date(pingsInWindow[i - 1].recorded_at).getTime();
        const b = new Date(pingsInWindow[i].recorded_at).getTime();
        const gap = Math.round((b - a) / MS_PER_MIN);
        if (gap >= gapMinutes) {
          sessionFlags.push({
            type: 'gps_gap',
            severity: gap >= 60 ? 'critical' : 'warning',
            at: pingsInWindow[i - 1].recorded_at,
            until: pingsInWindow[i].recorded_at,
            durationMin: gap,
            message: `GPS-glapp på ${gap} min under ${s.label}`,
            sessionId: s.id,
          });
        }
      }
    } else if (pingsInWindow.length === 0 && duration >= gapMinutes) {
      sessionFlags.push({
        type: 'gps_gap',
        severity: 'critical',
        at: s.start,
        until: s.end,
        durationMin: duration,
        message: `Inga GPS-pings under hela rapporten (${duration} min) för ${s.label}`,
        sessionId: s.id,
      });
    }

    // ── wrong_reported_site
    if (
      input.knownSites &&
      input.knownSites.length > 0 &&
      pingsInWindow.length >= 5
    ) {
      // Tally pings per known site (exclude the one currently reported).
      const tally = new Map<string, { site: KnownSite; count: number }>();
      for (const p of pingsInWindow) {
        for (const site of input.knownSites) {
          const r = site.radiusMeters ?? defaultRadius;
          const d = haversineMeters(site, { lat: p.lat, lng: p.lng });
          if (d <= r) {
            const cur = tally.get(site.id) ?? { site, count: 0 };
            cur.count += 1;
            tally.set(site.id, cur);
            break; // one site per ping (closest match implicit by order)
          }
        }
      }
      const reportedKey =
        s.targetId && tally.has(s.targetId) ? s.targetId : null;
      const reportedCount = reportedKey ? tally.get(reportedKey)!.count : 0;
      let bestOther: { site: KnownSite; count: number } | null = null;
      for (const [id, v] of tally) {
        if (id === s.targetId) continue;
        if (!bestOther || v.count > bestOther.count) bestOther = v;
      }
      if (
        bestOther &&
        bestOther.count >= 5 &&
        bestOther.count > reportedCount * 2
      ) {
        sessionFlags.push({
          type: 'wrong_reported_site',
          severity: 'warning',
          at: s.start,
          until: s.end,
          durationMin: duration,
          message: `Personen verkar ha varit på ${bestOther.site.label} (${bestOther.count} pings) snarare än ${s.label} (${reportedCount} pings)`,
          detail: {
            reported_target: { id: s.targetId, label: s.label, pings: reportedCount },
            actual_site: {
              id: bestOther.site.id,
              type: bestOther.site.type,
              label: bestOther.site.label,
              pings: bestOther.count,
            },
          },
          sessionId: s.id,
        });
      }
    }

    // ── current_position
    let currentPing: RealityPing | null = null;
    if (isOpen) {
      currentPing = lastPing; // newest available
    } else {
      currentPing = pingsInWindow[pingsInWindow.length - 1] ?? null;
    }
    const currentPos = currentPing
      ? {
          lat: currentPing.lat,
          lng: currentPing.lng,
          recorded_at: currentPing.recorded_at,
        }
      : null;
    const currentDist =
      currentPos && s.site
        ? Math.round(haversineMeters(s.site, currentPos))
        : null;

    sessions.push({
      session_id: s.id,
      kind: s.kind,
      label: s.label,
      target_type: s.targetType,
      target_id: s.targetId,
      start: s.start,
      end: s.end,
      is_open: isOpen,
      duration_min: duration,
      timer_start_position: startPos,
      timer_start_distance_to_reported_site: startDist,
      timer_started_offsite: timerStartedOffsite,
      last_seen_at_reported_site: lastSeenAtSite,
      left_reported_site_at: leftAt,
      current_position: currentPos,
      current_distance_to_reported_site: currentDist,
      pings_in_session: pingsInWindow.length,
      pings_at_site: pingsAtSite.length,
      flags: sessionFlags,
    });
  }

  return {
    staff_id: input.staffId,
    date: input.date,
    generated_at: nowIso,
    workday: input.workday,
    gps_points_count: pings.length,
    first_ping: firstPing,
    last_ping: lastPing,
    sessions,
    flags: dayFlags,
  };
}
