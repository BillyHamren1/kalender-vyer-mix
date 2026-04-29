/**
 * Build a flat, factual timeline of a staff member's day from GPS pings
 * + reported sessions. NO prose, NO coordinates — just timestamps,
 * durations and clearly marked discrepancies.
 *
 * Output is a list of `DayFact` rows, each with a kind:
 *   - arrival              first ping at base
 *   - at_base              continuous period within threshold of base
 *   - away                 continuous period >threshold from base
 *                          (subtype: short_break | likely_lunch | extended)
 *   - departure            last ping at base
 *   - report_vs_gps        single comparison row (rapport-tid vs GPS-tid)
 *   - report_overrun       rapporten löper efter sista GPS-pinget vid bas
 *
 * Pure function — no I/O.
 */

import { haversineMeters, type Ping } from './movementDetection';

export type DayFactKind =
  | 'arrival'
  | 'at_base'
  | 'away'
  | 'departure'
  | 'report_vs_gps'
  | 'report_overrun';

export type AwaySubtype = 'short_break' | 'likely_lunch' | 'extended';

export interface DayFact {
  kind: DayFactKind;
  /** Primary timestamp (ISO). For periods this is the start. */
  at: string;
  /** End timestamp for periods (null for point events). */
  until?: string | null;
  /** Duration in minutes (for periods). */
  durationMin?: number;
  /** Short factual label, Swedish. */
  label: string;
  /** Optional secondary detail (e.g. "rapport startad 06:51, +9 min"). */
  detail?: string;
  /** True iff this row should be highlighted as a discrepancy. */
  flagged?: boolean;
  /** Sub-classification for "away" rows. */
  awaySubtype?: AwaySubtype;
  /** Median coordinate of the "away" period — used for reverse-geocoding. */
  awayCoords?: { lat: number; lng: number } | null;
  /** Approximate distance from base (m) for the away period. */
  awayDistanceMeters?: number;
}

export interface BuildDayFactsInput {
  pings: Ping[];
  /** Reported session start (ISO) — typically time_report.start_iso. */
  reportedStart: string;
  /** Reported session end (ISO) or null if still open. */
  reportedEnd: string | null;
  /** Optional fixed base. If omitted, derived from median of in-window pings. */
  base?: { lat: number; lng: number } | null;
  /** Distance threshold (m). Default 200. */
  thresholdMeters?: number;
  /** Grace window before/after the report to look for arrival/departure (min). Default 60. */
  graceMinutes?: number;
  /** Ignore "away" gaps shorter than this many minutes (treated as GPS noise). Default 6. */
  minAwayMinutes?: number;
  /** Label for the base (e.g. "FA Warehouse") — used in row text. */
  baseLabel?: string | null;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

const classifyAway = (mins: number): AwaySubtype => {
  if (mins < 20) return 'short_break';
  if (mins <= 90) return 'likely_lunch';
  return 'extended';
};

const awayLabel = (sub: AwaySubtype, baseLabel: string | null | undefined): string => {
  const from = baseLabel ? ` från ${baseLabel}` : '';
  switch (sub) {
    case 'short_break': return `Kort frånvaro${from}`;
    case 'likely_lunch': return `Borta${from} (sannolik lunch)`;
    case 'extended': return `Borta${from}`;
  }
};

/**
 * Walk pings chronologically and split them into runs of "at base" /
 * "away from base" using the haversine distance to the resolved base.
 * Returns merged periods (consecutive same-kind pings collapsed).
 */
function segmentByBase(
  pings: Ping[],
  base: { lat: number; lng: number },
  thresholdMeters: number,
): Array<{ kind: 'at' | 'away'; start: string; end: string; pings: Ping[] }> {
  const out: Array<{ kind: 'at' | 'away'; start: string; end: string; pings: Ping[] }> = [];
  for (const p of pings) {
    const at = haversineMeters(base, { lat: p.lat, lng: p.lng }) <= thresholdMeters;
    const kind: 'at' | 'away' = at ? 'at' : 'away';
    const last = out[out.length - 1];
    if (last && last.kind === kind) {
      last.end = p.recorded_at;
      last.pings.push(p);
    } else {
      out.push({ kind, start: p.recorded_at, end: p.recorded_at, pings: [p] });
    }
  }
  return out;
}

export function buildDayFacts(input: BuildDayFactsInput): DayFact[] {
  const threshold = Math.max(1, input.thresholdMeters ?? 200);
  const graceMs = Math.max(0, (input.graceMinutes ?? 60) * 60 * 1000);
  const minAwayMin = Math.max(1, input.minAwayMinutes ?? 6);

  const startMs = new Date(input.reportedStart).getTime();
  const endMs = input.reportedEnd ? new Date(input.reportedEnd).getTime() : Date.now();
  const lo = startMs - graceMs;
  const hi = endMs + graceMs;

  const pings = [...input.pings]
    .filter(p => {
      const t = new Date(p.recorded_at).getTime();
      return Number.isFinite(t) && t >= lo && t <= hi;
    })
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  if (pings.length === 0) {
    return [{
      kind: 'report_vs_gps',
      at: input.reportedStart,
      label: 'Inga GPS-pings under rapporterad tid',
      detail: 'Det går inte att verifiera närvaro mot GPS för den här sessionen.',
      flagged: true,
    }];
  }

  // Resolve base: prefer provided; else median of pings in strict report window
  let base = input.base ?? null;
  if (!base) {
    const strict = pings.filter(p => {
      const t = new Date(p.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });
    const seed = strict.length >= 3 ? strict : pings;
    base = { lat: median(seed.map(p => p.lat)), lng: median(seed.map(p => p.lng)) };
  }

  const segments = segmentByBase(pings, base, threshold);

  // Merge tiny "away" segments (likely GPS noise) back into surrounding "at"
  const cleaned: typeof segments = [];
  for (const s of segments) {
    if (s.kind === 'away') {
      const dur = minutesBetween(s.start, s.end);
      if (dur < minAwayMin) {
        // collapse into previous (or skip if no previous)
        const prev = cleaned[cleaned.length - 1];
        if (prev && prev.kind === 'at') {
          prev.end = s.end;
          prev.pings.push(...s.pings);
          continue;
        }
      }
    }
    cleaned.push(s);
  }

  // Find first/last "at base" ping for arrival/departure
  const firstAt = cleaned.find(s => s.kind === 'at');
  const lastAtIdx = (() => {
    for (let i = cleaned.length - 1; i >= 0; i--) if (cleaned[i].kind === 'at') return i;
    return -1;
  })();
  const lastAt = lastAtIdx >= 0 ? cleaned[lastAtIdx] : null;

  const facts: DayFact[] = [];
  const baseLabel = input.baseLabel ?? null;

  // ── 1. Arrival vs reported start ────────────────────────────────────
  if (firstAt) {
    const arrIso = firstAt.start;
    const diff = minutesBetween(arrIso, input.reportedStart); // +ve = report later
    facts.push({
      kind: 'arrival',
      at: arrIso,
      label: baseLabel ? `Anlände till ${baseLabel}` : 'Anlände till arbetsplatsen',
      detail:
        Math.abs(diff) < 2
          ? 'Matchar rapporterad starttid'
          : diff > 0
            ? `Rapport startad ${diff} min senare`
            : `Rapport startad ${Math.abs(diff)} min tidigare`,
      flagged: Math.abs(diff) >= 15,
    });
  }

  // ── 2. At-base / away periods between arrival and departure ─────────
  for (let i = 0; i < cleaned.length; i++) {
    const s = cleaned[i];
    const dur = minutesBetween(s.start, s.end);
    if (dur < 1) continue; // skip single-ping periods
    if (s.kind === 'at') {
      // skip the very first/last "at" run — already reflected in arrival/departure
      const isEdge = (s === firstAt && i === cleaned.findIndex(x => x === firstAt))
        || (s === lastAt);
      if (isEdge) continue;
      facts.push({
        kind: 'at_base',
        at: s.start,
        until: s.end,
        durationMin: dur,
        label: baseLabel ? `Vid ${baseLabel}` : 'Vid arbetsplatsen',
      });
    } else {
      const sub = classifyAway(dur);
      const awayCentre = {
        lat: median(s.pings.map(p => p.lat)),
        lng: median(s.pings.map(p => p.lng)),
      };
      const dist = Math.round(haversineMeters(base, awayCentre));
      facts.push({
        kind: 'away',
        at: s.start,
        until: s.end,
        durationMin: dur,
        label: awayLabel(sub, baseLabel),
        awaySubtype: sub,
        flagged: sub === 'extended',
        awayCoords: awayCentre,
        awayDistanceMeters: dist,
      });
    }
  }

  // ── 3. Departure vs reported end ────────────────────────────────────
  if (lastAt) {
    const depIso = lastAt.end;
    if (input.reportedEnd) {
      const diff = minutesBetween(depIso, input.reportedEnd); // +ve = report stretches past departure
      facts.push({
        kind: 'departure',
        at: depIso,
        label: baseLabel ? `Lämnade ${baseLabel}` : 'Lämnade arbetsplatsen',
        detail:
          Math.abs(diff) < 2
            ? 'Matchar rapporterad sluttid'
            : diff > 0
              ? `Rapport stängd ${diff} min senare`
              : `Rapport stängd ${Math.abs(diff)} min tidigare`,
        flagged: Math.abs(diff) >= 15,
      });

      // Explicit overrun row when the report runs significantly past last
      // GPS-presence at the base — this is the "rapporten täcker till 19:53
      // men han lämnade 16:02"-fallet.
      if (diff >= 30) {
        facts.push({
          kind: 'report_overrun',
          at: depIso,
          until: input.reportedEnd,
          durationMin: diff,
          label: 'Rapporterad tid utan GPS-närvaro vid basen',
          detail: `${diff} min av rapporten ligger efter sista pinget vid ${baseLabel ?? 'basen'}.`,
          flagged: true,
        });
      }
    } else {
      facts.push({
        kind: 'departure',
        at: depIso,
        label: baseLabel ? `Senast vid ${baseLabel}` : 'Senast vid arbetsplatsen',
        detail: 'Rapporten är fortfarande öppen',
      });
    }
  } else {
    // No "at base" pings at all during the window
    facts.push({
      kind: 'report_vs_gps',
      at: input.reportedStart,
      label: 'GPS visar ingen närvaro vid basen',
      detail: 'Pings finns men aldrig inom 200 m från beräknad arbetsplats.',
      flagged: true,
    });
  }

  return facts;
}
