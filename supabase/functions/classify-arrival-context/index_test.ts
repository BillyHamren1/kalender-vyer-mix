import {
  assertEquals,
  assert,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { classifyArrival } from './index.ts'

/**
 * Pure-logic tests for classify-arrival-context.
 *
 * We stub the supabase client and mapbox token. No network and no DB calls
 * happen; the stubs return what each test scenario needs.
 */

type StubResult = { data: any; error: any }
function ok(data: any): StubResult { return { data, error: null } }
function empty(): StubResult { return { data: [], error: null } }

function makeSupabaseStub(opts: {
  bookings?: any[]
  assignments?: any[]
  fixedLocations?: any[]
  recentDecided?: any[]
}) {
  const inserts: any[] = []
  const stub = {
    from(table: string) {
      const ctx: any = { _table: table, _filters: {} }
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        gte() { return chain },
        lte() { return chain },
        not() { return chain },
        in() { return chain },
        is() { return chain },
        order() { return chain },
        limit() { return chain },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        single() { return Promise.resolve({ data: { id: 'sugg-1' }, error: null }) },
        insert(row: any) {
          inserts.push({ table, row })
          return {
            select() {
              return {
                single() { return Promise.resolve({ data: { id: 'sugg-1' }, error: null }) },
              }
            },
          }
        },
        then(resolve: any) {
          // Final await — return the data array based on table
          if (table === 'bookings') return resolve(ok(opts.bookings || []))
          if (table === 'booking_staff_assignments') return resolve(ok(opts.assignments || []))
          if (table === 'organization_locations') return resolve(ok(opts.fixedLocations || []))
          if (table === 'arrival_context_suggestions') return resolve(ok(opts.recentDecided || []))
          return resolve(empty())
        },
      }
      return chain
    },
    _inserts: inserts,
  }
  return stub
}

const STAFF = 'staff-1'
const ORG = 'org-1'

// Fixed coordinates for "same place" across tests
const STORGATAN_LAT = 59.3293
const STORGATAN_LNG = 18.0686

// Force "now" to a deterministic time when tests need it
function atTime(hour: number, minute = 0): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

Deno.test('A: planlagt jobb 3 dagar fram, ej assignad → unplanned_job_candidate', async () => {
  const eventdate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)
  const supa = makeSupabaseStub({
    bookings: [
      {
        id: 'bk-1',
        client: 'Acme AB',
        eventdate,
        rigdaydate: null,
        delivery_latitude: STORGATAN_LAT,
        delivery_longitude: STORGATAN_LNG,
        deliveryaddress: 'Storgatan 5',
      },
    ],
    assignments: [], // user not assigned
  })
  const r = await classifyArrival(supa as any, null, {
    staff_id: STAFF,
    organization_id: ORG,
    lat: STORGATAN_LAT,
    lng: STORGATAN_LNG,
  })
  assertEquals(r.kind, 'unplanned_job_candidate')
  assert(r.confidence >= 0.9, 'confidence high')
  assertEquals((r.payload as any).booking_id, 'bk-1')
  assertEquals((r.payload as any).client, 'Acme AB')
})

Deno.test('A: assignad → suppress (returnerar unknown utan prompt)', async () => {
  const eventdate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)
  const supa = makeSupabaseStub({
    bookings: [
      {
        id: 'bk-2',
        client: 'Beta',
        eventdate,
        delivery_latitude: STORGATAN_LAT,
        delivery_longitude: STORGATAN_LNG,
        deliveryaddress: 'Storgatan 5',
      },
    ],
    assignments: [{ booking_id: 'bk-2' }],
  })
  // Stub fetch so AI fallback (Lovable AI Gateway) cannot influence result
  const origFetch = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve(new Response('{}', { status: 500 }))) as any
  try {
    const r = await classifyArrival(supa as any, null, {
      staff_id: STAFF,
      organization_id: ORG,
      lat: STORGATAN_LAT,
      lng: STORGATAN_LNG,
    })
    assertEquals(r.kind, 'unknown')
  } finally {
    globalThis.fetch = origFetch
  }
})

Deno.test('B: restaurang kl 12:15 → meal_break', async () => {
  // Stub fetch for mapbox
  const origFetch = globalThis.fetch
  globalThis.fetch = ((url: string) => {
    if (url.includes('mapbox')) {
      return Promise.resolve(new Response(JSON.stringify({
        features: [{
          text: 'Pinchos',
          place_name: 'Pinchos, Storgatan 1',
          properties: { category: 'restaurant, food and drink' },
        }],
      }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as any

  try {
    const supa = makeSupabaseStub({})
    const r = await classifyArrival(supa as any, 'fake-token', {
      staff_id: STAFF,
      organization_id: ORG,
      lat: 59.4,
      lng: 18.1,
      arrived_at: atTime(12, 15),
    })
    assertEquals(r.kind, 'meal_break')
    assertStringIncludes(((r.payload as any).place_name || ''), 'Pinchos')
  } finally {
    globalThis.fetch = origFetch
  }
})

Deno.test('B-neg: restaurang kl 15:00 → ingen meal_break', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = ((url: string) => {
    if (url.includes('mapbox')) {
      return Promise.resolve(new Response(JSON.stringify({
        features: [{
          text: 'Pinchos',
          place_name: 'Pinchos',
          properties: { category: 'restaurant' },
        }],
      }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as any

  try {
    const supa = makeSupabaseStub({})
    const r = await classifyArrival(supa as any, 'fake-token', {
      staff_id: STAFF,
      organization_id: ORG,
      lat: 59.4,
      lng: 18.1,
      arrived_at: atTime(15, 0),
    })
    // Outside lunch window → categorizePoi returns unknown; AI fallback
    // also has no LOVABLE_API_KEY in tests so it returns null → unknown
    assertEquals(r.kind, 'unknown')
  } finally {
    globalThis.fetch = origFetch
  }
})

Deno.test('C: Bauhaus → supply_store via namnmönster', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = ((url: string) => {
    if (url.includes('mapbox')) {
      return Promise.resolve(new Response(JSON.stringify({
        features: [{
          text: 'Bauhaus',
          place_name: 'Bauhaus, Sickla',
          properties: { category: 'shop' }, // generic — name pattern fires
        }],
      }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as any

  try {
    const supa = makeSupabaseStub({})
    const r = await classifyArrival(supa as any, 'fake-token', {
      staff_id: STAFF,
      organization_id: ORG,
      lat: 59.3,
      lng: 18.1,
    })
    assertEquals(r.kind, 'supply_store')
  } finally {
    globalThis.fetch = origFetch
  }
})

Deno.test('D: residential utan POI → unknown, ingen prompt', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 }))) as any
  try {
    const supa = makeSupabaseStub({})
    const r = await classifyArrival(supa as any, 'fake-token', {
      staff_id: STAFF,
      organization_id: ORG,
      lat: 59.5,
      lng: 18.5,
    })
    assertEquals(r.kind, 'unknown')
  } finally {
    globalThis.fetch = origFetch
  }
})

Deno.test('Fixed location nearby → suppress', async () => {
  const supa = makeSupabaseStub({
    fixedLocations: [{ latitude: STORGATAN_LAT, longitude: STORGATAN_LNG }],
  })
  const r = await classifyArrival(supa as any, null, {
    staff_id: STAFF,
    organization_id: ORG,
    lat: STORGATAN_LAT,
    lng: STORGATAN_LNG,
  })
  assertEquals(r.kind, 'unknown')
  assertEquals((r.payload as any).suppressed_reason, 'fixed_location')
})

Deno.test('Already decided same day same place → suppress', async () => {
  const supa = makeSupabaseStub({
    recentDecided: [
      { id: 'prev', lat: STORGATAN_LAT, lng: STORGATAN_LNG, decision: 'rejected', decided_at: new Date().toISOString() },
    ],
  })
  const r = await classifyArrival(supa as any, null, {
    staff_id: STAFF,
    organization_id: ORG,
    lat: STORGATAN_LAT,
    lng: STORGATAN_LNG,
  })
  assertEquals(r.kind, 'unknown')
  assertEquals(r.suppressed_reason, 'already_decided_today')
})

Deno.test('Copy-test: payload för A innehåller datum + client (men inte ord som "tilldela")', async () => {
  const eventdate = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10)
  const supa = makeSupabaseStub({
    bookings: [
      {
        id: 'bk-99',
        client: 'Acme AB',
        eventdate,
        delivery_latitude: STORGATAN_LAT,
        delivery_longitude: STORGATAN_LNG,
        deliveryaddress: 'Storgatan 5',
      },
    ],
    assignments: [],
  })
  const r = await classifyArrival(supa as any, null, {
    staff_id: STAFF,
    organization_id: ORG,
    lat: STORGATAN_LAT,
    lng: STORGATAN_LNG,
  })
  const blob = JSON.stringify(r.payload).toLowerCase()
  assertStringIncludes(blob, 'acme')
  assertStringIncludes(blob, eventdate)
  // Server payload must not include any assignment vocabulary
  assert(!blob.includes('tilldela'))
  assert(!blob.includes('ta jobbet'))
  assert(!blob.includes('assign'))
})
