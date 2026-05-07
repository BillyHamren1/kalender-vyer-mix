// @ts-nocheck
// ============================================================================
// process-location-auto-start :: scenario_test
// ----------------------------------------------------------------------------
// Verifies the engine end-to-end against an isolated in-memory fake Supabase
// + a Markuss-style fixture (FA Warehouse 06:51–07:33 → Workman 08:03+).
//
// CRITICAL: This test NEVER touches real production data. The engine is
// imported from ./engine.ts and given a fully synthetic supabase client
// whose tables live entirely in-process and are discarded after the test.
// ============================================================================

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
// NOTE: engine.ts is the permanently-disabled wrapper. The legacy engine
// behavior under test still lives in legacy-engine-disabled.ts (kept for
// historical reference and this scenario test only). Do not re-import the
// legacy engine from production code.
import { runEngine, type ProcessReport } from './legacy-engine-disabled.ts'

// ── In-memory fake Supabase ─────────────────────────────────────────────────

interface UniqueIndex {
  table: string
  // returns a key (or null = no index conflict for this row)
  keyFn: (row: any) => string | null
}

class FakeStore {
  rows = new Map<string, any[]>()
  uniques: UniqueIndex[] = []
  autoId = 1

  table(name: string) {
    if (!this.rows.has(name)) this.rows.set(name, [])
    return this.rows.get(name)!
  }
  addUnique(u: UniqueIndex) { this.uniques.push(u) }

  insert(table: string, row: any): { data: any; error: any } {
    const t = this.table(table)
    const enriched = { id: row.id ?? `gen_${this.autoId++}`, ...row }
    for (const u of this.uniques) {
      if (u.table !== table) continue
      const k = u.keyFn(enriched)
      if (k == null) continue
      for (const existing of t) {
        if (u.keyFn(existing) === k) {
          return { data: null, error: { code: '23505', message: `unique conflict on ${table}` } }
        }
      }
    }
    t.push(enriched)
    return { data: enriched, error: null }
  }
}

type FilterOp = (row: any) => boolean

class QueryBuilder {
  filters: FilterOp[] = []
  orderKey: string | null = null
  orderAsc = true
  limitN: number | null = null
  pendingInsert: any = null
  pendingUpdate: any = null
  selectCols: string | null = null

  constructor(private store: FakeStore, private tableName: string) {}

  select(cols?: string) { this.selectCols = cols ?? '*'; return this }
  eq(col: string, v: any) { this.filters.push((r) => r[col] === v); return this }
  is(col: string, v: any) {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v))
    return this
  }
  gte(col: string, v: any) { this.filters.push((r) => r[col] != null && r[col] >= v); return this }
  lte(col: string, v: any) { this.filters.push((r) => r[col] != null && r[col] <= v); return this }
  not(col: string, _op: string, v: any) {
    this.filters.push((r) => (v === null ? r[col] != null : r[col] !== v))
    return this
  }
  // Engine uses .or() but the fake treats it as a no-op filter (the test
  // fixtures only contain rows that should be returned anyway).
  or(_expr: string) { return this }
  order(key: string, opts?: { ascending?: boolean }) {
    this.orderKey = key
    this.orderAsc = opts?.ascending !== false
    return this
  }
  limit(n: number) { this.limitN = n; return this }

  insert(row: any) { this.pendingInsert = row; return this }
  update(patch: any) { this.pendingUpdate = patch; return this }
  upsert(row: any) {
    // Treat as insert OR update by primary key 'id'.
    const t = this.store.table(this.tableName)
    const idx = t.findIndex((r) => r.id === row.id)
    if (idx >= 0) Object.assign(t[idx], row)
    else t.push(row)
    return Promise.resolve({ data: row, error: null }) as any
  }

  private resolveSelectRows(): any[] {
    const t = this.store.table(this.tableName)
    let rows = t.filter((r) => this.filters.every((f) => f(r)))
    if (this.orderKey) {
      const k = this.orderKey
      rows = [...rows].sort((a, b) => {
        const av = a[k], bv = b[k]
        if (av === bv) return 0
        return (av < bv ? -1 : 1) * (this.orderAsc ? 1 : -1)
      })
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN)
    return rows
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    if (this.pendingInsert) {
      const res = this.store.insert(this.tableName, this.pendingInsert)
      return Promise.resolve(res)
    }
    if (this.pendingUpdate) {
      // .update().eq(...).is(...) followed by maybeSingle is rare; engine
      // currently doesn't call maybeSingle on update, but support for safety.
      const t = this.store.table(this.tableName)
      const matches = t.filter((r) => this.filters.every((f) => f(r)))
      for (const m of matches) Object.assign(m, this.pendingUpdate)
      return Promise.resolve({ data: matches[0] ?? null, error: null })
    }
    const rows = this.resolveSelectRows()
    return Promise.resolve({ data: rows[0] ?? null, error: null })
  }

  // PostgrestBuilder is awaitable — engine awaits .insert/.update directly
  // (no maybeSingle) for fire-and-forget writes, and awaits .select().eq()
  // chains for list reads.
  then(onFulfilled: any, onRejected?: any) {
    if (this.pendingInsert) {
      const res = this.store.insert(this.tableName, this.pendingInsert)
      return Promise.resolve(res).then(onFulfilled, onRejected)
    }
    if (this.pendingUpdate) {
      const t = this.store.table(this.tableName)
      const matches = t.filter((r) => this.filters.every((f) => f(r)))
      for (const m of matches) Object.assign(m, this.pendingUpdate)
      return Promise.resolve({ data: matches, error: null }).then(onFulfilled, onRejected)
    }
    const rows = this.resolveSelectRows()
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
  }
}

class FakeSupabase {
  store = new FakeStore()
  from(table: string) { return new QueryBuilder(this.store, table) }
}

// ── Fixture: FA Warehouse + Workman + Markuss-style pings ───────────────────

const ORG_ID = 'org-test-fixture'
const STAFF_ID = 'staff-test-fixture'
const FA_LOC_ID = 'loc-fa-warehouse'
const WORKMAN_BOOKING_ID = 'booking-workman'

// Coordinates chosen far apart (>5km) so the radii never overlap.
const FA = { lat: 59.0000, lng: 18.0000, radius: 200 }
const WORKMAN = { lat: 59.1000, lng: 18.1000, radius: 200 }

function ping(idx: number, atIso: string, lat: number, lng: number, accuracy = 20): any {
  return {
    id: `ping-${idx}`,
    staff_id: STAFF_ID,
    organization_id: ORG_ID,
    lat, lng, accuracy,
    recorded_at: atIso,
  }
}

// Build pings densely enough to satisfy stable-entry rules (≥3, dwell ≥2min,
// accuracy ≤75m). Times match the Markuss case on 2026-05-05.
function buildFixturePings(): any[] {
  const pings: any[] = []
  let idx = 0
  // FA Warehouse 06:51 → 07:33 every 4 minutes (11 pings, dwell 42min).
  const faMinutes = [51, 55, 59, 63, 67, 71, 75, 79, 83, 87, 91, 93]
  for (const m of faMinutes) {
    const h = 6 + Math.floor(m / 60)
    const mm = m % 60
    const iso = `2026-05-05T${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00.000Z`
    pings.push(ping(++idx, iso, FA.lat, FA.lng))
  }
  // Workman 08:03 → 09:00 every 4 minutes (15 pings, dwell ~57min).
  const wmMinutes = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59]
  for (const m of wmMinutes) {
    const iso = `2026-05-05T08:${String(m).padStart(2,'0')}:00.000Z`
    pings.push(ping(++idx, iso, WORKMAN.lat, WORKMAN.lng))
  }
  return pings
}

function seedFixture(fake: FakeSupabase) {
  // Unique indexes the real schema enforces.
  fake.store.addUnique({
    table: 'assistant_events',
    keyFn: (r) => r.dedupe_key ?? null,
  })
  fake.store.addUnique({
    table: 'location_time_entries',
    keyFn: (r) => r.exited_at == null && r.location_id
      ? `lte:open:${r.staff_id}:loc:${r.location_id}`
      : r.exited_at == null && r.booking_id
      ? `lte:open:${r.staff_id}:bk:${r.booking_id}`
      : r.exited_at == null && r.large_project_id
      ? `lte:open:${r.staff_id}:pj:${r.large_project_id}`
      : null,
  })
  fake.store.addUnique({
    table: 'workdays',
    keyFn: (r) => r.ended_at == null ? `wd:open:${r.staff_id}` : null,
  })

  fake.store.table('organization_locations').push({
    id: FA_LOC_ID,
    organization_id: ORG_ID,
    name: 'FA Warehouse',
    latitude: FA.lat, longitude: FA.lng,
    radius_meters: FA.radius,
    geofence_mode: 'circle',
    geofence_polygon: null,
    is_active: true,
  })
  fake.store.table('bookings').push({
    id: WORKMAN_BOOKING_ID,
    organization_id: ORG_ID,
    client: 'Workman',
    delivery_latitude: WORKMAN.lat,
    delivery_longitude: WORKMAN.lng,
    rigdaydate: '2026-05-05',
    eventdate: '2026-05-05',
    rigdowndate: '2026-05-05',
    large_project_id: null,
  })
  for (const p of buildFixturePings()) fake.store.table('staff_location_history').push(p)
}

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test('engine creates workday + LTEs + travel + events from zero (Markuss fixture)', async () => {
  const fake = new FakeSupabase()
  seedFixture(fake)

  const report: ProcessReport = await runEngine(fake as any, {
    action: 'backfill_day',
    date: '2026-05-05',
    organization_id: ORG_ID,
    staff_id: STAFF_ID,
    dry_run: false,
  })

  assertEquals(report.errors, [], `engine reported errors: ${report.errors.join(' | ')}`)
  assertEquals(report.dry_run, false)
  assertEquals(report.staff, 1)
  assert(report.pings >= 25, `expected fixture pings to be loaded, got ${report.pings}`)
  assertEquals(report.arrivals, 2, 'expected 2 stable arrivals (FA + Workman)')
  assertEquals(report.switches, 1, 'expected exactly 1 switch FA → Workman')
  assertEquals(report.workdays_opened, 1)
  assertEquals(report.ltes_opened, 2)
  assertEquals(report.ltes_closed, 1)
  assertEquals(report.travels_created, 1)
  // 1 arrival + 1 (departure + arrival) for the switch = 3 events
  assertEquals(report.events_emitted, 3)

  // ── Inspect resulting rows ─────────────────────────────────────────────
  const wds = fake.store.table('workdays')
  assertEquals(wds.length, 1)
  assertEquals(wds[0].started_at, '2026-05-05T06:51:00.000Z')
  assertEquals(wds[0].started_by, 'server_auto_start_backfill')
  assertEquals(wds[0].metadata?.auto_started, true)

  const ltes = fake.store.table('location_time_entries')
  assertEquals(ltes.length, 2)
  const faLte = ltes.find((l) => l.location_id === FA_LOC_ID)!
  const wmLte = ltes.find((l) => l.booking_id === WORKMAN_BOOKING_ID)!
  assert(faLte && wmLte, 'expected one LTE per target')
  assertEquals(faLte.entered_at, '2026-05-05T06:51:00.000Z')
  assertEquals(faLte.exited_at, '2026-05-05T07:33:00.000Z')
  assertEquals(wmLte.entered_at, '2026-05-05T08:03:00.000Z')
  assertEquals(wmLte.exited_at, undefined)
  assertEquals(faLte.metadata?.auto_started, true)
  assertEquals(wmLte.metadata?.auto_started, true)

  const travels = fake.store.table('travel_time_logs')
  assertEquals(travels.length, 1)
  assertEquals(travels[0].start_time, '2026-05-05T07:33:00.000Z')
  assertEquals(travels[0].end_time, '2026-05-05T08:03:00.000Z')
  assertEquals(travels[0].source, 'geofence_auto_switch_server_backfill')

  const events = fake.store.table('assistant_events')
  assertEquals(events.length, 3)
  const arrivals = events.filter((e) => e.event_type === 'arrival')
  const departures = events.filter((e) => e.event_type === 'departure')
  assertEquals(arrivals.length, 2)
  assertEquals(departures.length, 1)
  for (const e of events) assertEquals(e.metadata?.auto_started, true)
})

Deno.test('engine is idempotent — second run creates no duplicate rows', async () => {
  const fake = new FakeSupabase()
  seedFixture(fake)

  const first = await runEngine(fake as any, {
    action: 'backfill_day', date: '2026-05-05',
    organization_id: ORG_ID, staff_id: STAFF_ID, dry_run: false,
  })
  assertEquals(first.errors, [])

  const wdBefore = fake.store.table('workdays').length
  const lteBefore = fake.store.table('location_time_entries').length
  const travelBefore = fake.store.table('travel_time_logs').length
  const eventsBefore = fake.store.table('assistant_events').length

  const second = await runEngine(fake as any, {
    action: 'backfill_day', date: '2026-05-05',
    organization_id: ORG_ID, staff_id: STAFF_ID, dry_run: false,
  })

  assertEquals(fake.store.table('workdays').length, wdBefore, 'no duplicate workdays')
  assertEquals(fake.store.table('location_time_entries').length, lteBefore, 'no duplicate LTEs')
  assertEquals(fake.store.table('travel_time_logs').length, travelBefore, 'no duplicate travels')
  assertEquals(fake.store.table('assistant_events').length, eventsBefore, 'no duplicate events')

  // skipped_existing should account for re-detected workday + LTE(s).
  assert(second.skipped_existing >= 2, `expected skipped_existing≥2, got ${second.skipped_existing}`)
  assertEquals(second.workdays_opened, 0)
  // FA LTE was already closed, so engine sees no open LTE for FA target;
  // Workman LTE is still open, so it's reused (skipped_existing).
  assert(second.ltes_opened <= 1, `expected ≤1 new LTE on rerun, got ${second.ltes_opened}`)
})

Deno.test('engine dry_run does not mutate any table', async () => {
  const fake = new FakeSupabase()
  seedFixture(fake)

  const report = await runEngine(fake as any, {
    action: 'backfill_day', date: '2026-05-05',
    organization_id: ORG_ID, staff_id: STAFF_ID, dry_run: true,
  })

  assertEquals(report.dry_run, true)
  assertEquals(report.errors, [])
  assertEquals(fake.store.table('workdays').length, 0)
  assertEquals(fake.store.table('location_time_entries').length, 0)
  assertEquals(fake.store.table('travel_time_logs').length, 0)
  assertEquals(fake.store.table('assistant_events').length, 0)
  assert(report.plan.length > 0, 'dry_run should populate plan[]')
})
