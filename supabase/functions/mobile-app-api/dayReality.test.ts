// _shared/dayReality.test.ts
// Deno test suite for the day-reality analysis engine.
// Covers every flag type defined in PROMPT 1.

import {
  assertEquals,
  assert,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDayReality,
  haversineMeters,
  type DayRealityInput,
  type RealityPing,
  type RealitySessionInput,
  type FlagType,
} from '../_shared/dayReality.ts';

const SITE = { lat: 59.3293, lng: 18.0686 }; // Stockholm
const FAR  = { lat: 59.4500, lng: 18.2000 }; // ~14 km away

const T = (h: number, m: number = 0): string => {
  const d = new Date(Date.UTC(2026, 3, 29, h, m, 0));
  return d.toISOString();
};

const nearby = (offsetMeters: number, time: string): RealityPing => {
  // Move ~offsetMeters east of SITE
  const dLng = offsetMeters / (111_320 * Math.cos((SITE.lat * Math.PI) / 180));
  return { recorded_at: time, lat: SITE.lat, lng: SITE.lng + dLng };
};

const farPing = (time: string): RealityPing => ({
  recorded_at: time,
  lat: FAR.lat,
  lng: FAR.lng,
});

const baseSession = (overrides: Partial<RealitySessionInput> = {}): RealitySessionInput => ({
  id: 's1',
  kind: 'time_report',
  start: T(7, 0),
  end: T(16, 0),
  label: 'Bygg AB',
  targetType: 'booking',
  targetId: 'booking-1',
  site: { lat: SITE.lat, lng: SITE.lng, radiusMeters: 200 },
  ...overrides,
});

const baseInput = (overrides: Partial<DayRealityInput> = {}): DayRealityInput => ({
  staffId: 'staff-1',
  date: '2026-04-29',
  nowIso: T(20, 0),
  pings: [],
  sessions: [baseSession()],
  workday: { id: 'wd-1', started_at: T(6, 55), ended_at: T(16, 5) },
  ...overrides,
});

const flagTypes = (flags: { type: FlagType }[]): FlagType[] => flags.map((f) => f.type);

// ─── basics ────────────────────────────────────────────────────────────────

Deno.test('haversine: same point = 0', () => {
  assertEquals(Math.round(haversineMeters(SITE, SITE)), 0);
});

Deno.test('haversine: 14 km between SITE and FAR', () => {
  const d = haversineMeters(SITE, FAR);
  assert(d > 13_000 && d < 16_000, `distance was ${d}`);
});

// ─── flag: missing_gps ────────────────────────────────────────────────────

Deno.test('flag missing_gps when zero pings exist', () => {
  const r = buildDayReality(baseInput({ pings: [] }));
  assertEquals(r.gps_points_count, 0);
  assert(flagTypes(r.flags).includes('missing_gps'));
});

// ─── flag: timer_started_offsite ─────────────────────────────────────────

Deno.test('flag timer_started_offsite when first ping is far from site', () => {
  const r = buildDayReality(
    baseInput({
      pings: [farPing(T(7, 1)), farPing(T(8, 0)), nearby(50, T(9, 0))],
    }),
  );
  const s = r.sessions[0];
  assert(s.timer_started_offsite);
  assert(flagTypes(s.flags).includes('timer_started_offsite'));
  assert(s.timer_start_distance_to_reported_site! > 1000);
});

Deno.test('NO timer_started_offsite when first ping is at site', () => {
  const r = buildDayReality(
    baseInput({ pings: [nearby(50, T(7, 1)), nearby(60, T(8, 0))] }),
  );
  assertEquals(r.sessions[0].timer_started_offsite, false);
  assert(!flagTypes(r.sessions[0].flags).includes('timer_started_offsite'));
});

// ─── flag: never_at_reported_site ────────────────────────────────────────

Deno.test('flag never_at_reported_site when all pings are far', () => {
  const r = buildDayReality(
    baseInput({
      pings: [farPing(T(7, 30)), farPing(T(10, 0)), farPing(T(15, 0))],
    }),
  );
  const types = flagTypes(r.sessions[0].flags);
  assert(types.includes('never_at_reported_site'));
  assertEquals(r.sessions[0].pings_at_site, 0);
});

// ─── flag: left_site_timer_still_open ────────────────────────────────────

Deno.test('flag left_site_timer_still_open: open report, last on-site ping is old', () => {
  const r = buildDayReality(
    baseInput({
      nowIso: T(18, 0),
      sessions: [baseSession({ end: null })],
      pings: [
        nearby(20, T(7, 5)),
        nearby(30, T(9, 0)),
        nearby(40, T(12, 0)),       // last seen at site
        farPing(T(13, 0)),          // left site
        farPing(T(17, 55)),         // still away, recent ping
      ],
    }),
  );
  const s = r.sessions[0];
  assertEquals(s.is_open, true);
  assertExists(s.last_seen_at_reported_site);
  assertExists(s.left_reported_site_at);
  assert(flagTypes(s.flags).includes('left_site_timer_still_open'));
});

Deno.test('NO left_site_timer_still_open when staff is currently AT site', () => {
  const r = buildDayReality(
    baseInput({
      nowIso: T(18, 0),
      sessions: [baseSession({ end: null })],
      pings: [nearby(20, T(7, 5)), nearby(30, T(17, 58))],
    }),
  );
  assert(!flagTypes(r.sessions[0].flags).includes('left_site_timer_still_open'));
});

// ─── flag: report_overrun_after_departure ────────────────────────────────

Deno.test('flag report_overrun_after_departure when end is much later than last on-site ping', () => {
  const r = buildDayReality(
    baseInput({
      sessions: [baseSession({ start: T(7, 0), end: T(20, 0) })],
      pings: [nearby(30, T(7, 5)), nearby(40, T(10, 0)), nearby(50, T(16, 0))],
    }),
  );
  const types = flagTypes(r.sessions[0].flags);
  assert(types.includes('report_overrun_after_departure'));
  const flag = r.sessions[0].flags.find((f) => f.type === 'report_overrun_after_departure')!;
  assert(flag.durationMin! >= 200, `overrun was ${flag.durationMin}`);
});

Deno.test('NO report_overrun for closed report ending shortly after last ping', () => {
  const r = buildDayReality(
    baseInput({
      sessions: [baseSession({ start: T(7, 0), end: T(16, 5) })],
      pings: [nearby(30, T(7, 5)), nearby(40, T(16, 0))],
    }),
  );
  assert(!flagTypes(r.sessions[0].flags).includes('report_overrun_after_departure'));
});

// ─── flag: stale_phone ───────────────────────────────────────────────────

Deno.test('flag stale_phone when open session and no ping for >15 min', () => {
  const r = buildDayReality(
    baseInput({
      nowIso: T(18, 0),
      sessions: [baseSession({ end: null })],
      pings: [nearby(20, T(7, 5)), nearby(30, T(15, 0))], // last ping 3h ago
    }),
  );
  assert(flagTypes(r.flags).includes('stale_phone'));
});

Deno.test('NO stale_phone when no open session, even if pings are old', () => {
  const r = buildDayReality(
    baseInput({
      nowIso: T(20, 0),
      sessions: [baseSession({ end: T(16, 0) })],
      pings: [nearby(20, T(7, 5)), nearby(30, T(15, 0))],
    }),
  );
  assert(!flagTypes(r.flags).includes('stale_phone'));
});

// ─── flag: gps_gap ───────────────────────────────────────────────────────

Deno.test('flag gps_gap when 60-min hole inside session window', () => {
  const r = buildDayReality(
    baseInput({
      sessions: [baseSession({ start: T(7, 0), end: T(16, 0) })],
      pings: [
        nearby(30, T(7, 5)),
        nearby(30, T(8, 0)),
        nearby(30, T(9, 0)),
        // gap 9:00 → 11:00 = 120 min
        nearby(30, T(11, 0)),
        nearby(30, T(15, 50)),
      ],
    }),
  );
  const gaps = r.sessions[0].flags.filter((f) => f.type === 'gps_gap');
  assert(gaps.length >= 1);
  assert(gaps.some((g) => g.durationMin! >= 60));
});

Deno.test('flag gps_gap when zero pings inside a long session', () => {
  const r = buildDayReality(
    baseInput({
      sessions: [baseSession({ start: T(7, 0), end: T(16, 0) })],
      pings: [farPing(T(20, 0))], // outside window
    }),
  );
  const types = flagTypes(r.sessions[0].flags);
  assert(types.includes('gps_gap'));
});

// ─── flag: wrong_reported_site ───────────────────────────────────────────

Deno.test('flag wrong_reported_site when most pings cluster at OTHER known site', () => {
  // Reported site = SITE (booking-1). Staff actually at FAR (location-99).
  const r = buildDayReality(
    baseInput({
      sessions: [
        baseSession({
          start: T(7, 0),
          end: T(16, 0),
          targetId: 'booking-1',
          label: 'Booking 1',
        }),
      ],
      pings: [
        farPing(T(7, 5)),
        farPing(T(8, 0)),
        farPing(T(9, 0)),
        farPing(T(11, 0)),
        farPing(T(13, 0)),
        farPing(T(15, 0)),
      ],
      knownSites: [
        { id: 'booking-1', type: 'booking', label: 'Booking 1', lat: SITE.lat, lng: SITE.lng, radiusMeters: 200 },
        { id: 'location-99', type: 'location', label: 'Annan plats', lat: FAR.lat, lng: FAR.lng, radiusMeters: 200 },
      ],
    }),
  );
  const flag = r.sessions[0].flags.find((f) => f.type === 'wrong_reported_site');
  assertExists(flag);
  const detail = flag!.detail as any;
  assertEquals(detail.actual_site.id, 'location-99');
});

// ─── ergonomics ──────────────────────────────────────────────────────────

Deno.test('returns first/last ping and total count', () => {
  const r = buildDayReality(
    baseInput({
      pings: [nearby(20, T(7, 5)), nearby(30, T(12, 0)), nearby(40, T(15, 50))],
    }),
  );
  assertEquals(r.gps_points_count, 3);
  assertEquals(r.first_ping?.recorded_at, T(7, 5));
  assertEquals(r.last_ping?.recorded_at, T(15, 50));
});

Deno.test('current_position for OPEN session = newest ping anywhere', () => {
  const r = buildDayReality(
    baseInput({
      nowIso: T(18, 0),
      sessions: [baseSession({ end: null })],
      pings: [nearby(20, T(7, 5)), farPing(T(17, 30))],
    }),
  );
  assertEquals(r.sessions[0].current_position?.recorded_at, T(17, 30));
  assert(r.sessions[0].current_distance_to_reported_site! > 1000);
});
