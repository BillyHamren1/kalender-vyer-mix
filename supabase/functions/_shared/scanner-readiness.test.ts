import { verifyScannerReadiness } from './scanner-readiness.ts'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

type QueryResult = { data?: unknown; error?: unknown; count?: number | null }

class FakeQuery implements PromiseLike<QueryResult> {
  constructor(private readonly result: QueryResult) {}

  select() { return this }
  eq() { return this }
  maybeSingle() { return Promise.resolve(this.result) }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected)
  }
}

const fakeAdmin = (results: Record<string, QueryResult>) => ({
  from(table: string) {
    const result = results[table]
    if (!result) throw new Error(`Unexpected table query: ${table}`)
    return new FakeQuery(result)
  },
})

const baseInput = {
  organizationId: 'org-1',
  staffId: 'staff-1',
  packingId: 'packing-1',
  sessionId: 'session-1',
  bookingNumber: 'BOOK-101',
  reservationId: 'BOOK-101',
  wmsBaseUrl: 'https://wms.test',
  apiKey: 'test-key',
}

const readyDatabase = () => fakeAdmin({
  packing_projects: {
    data: {
      id: 'packing-1',
      organization_id: 'org-1',
      booking_id: 'booking-1',
      status: 'in_progress',
      blocked_by_short_notice_change: false,
      needs_packing_review: false,
    },
  },
  packing_work_sessions: {
    data: {
      id: 'session-1',
      packing_id: 'packing-1',
      staff_id: 'staff-1',
      organization_id: 'org-1',
      status: 'active',
    },
  },
  bookings: {
    data: { id: 'booking-1', booking_number: 'BOOK-101', organization_id: 'org-1' },
  },
  packing_change_requests: { count: 0 },
  packing_list_items: {
    data: [{
      id: 'item-1',
      wms_item_type_id: 'type-1',
      wms_sku: 'SKU-1',
      wms_identity_needs_repair: false,
      excluded: false,
    }],
  },
})

Deno.test('readiness fails before database and WMS when session is missing', async () => {
  let queried = false
  const result = await verifyScannerReadiness({
    ...baseInput,
    sessionId: null,
    admin: { from: () => { queried = true; throw new Error('must not query') } },
  })
  assert(!result.ok, 'missing session must fail')
  assert(result.code === 'PACKING_SESSION_REQUIRED', `unexpected code: ${result.code}`)
  assert(!queried, 'database must not be queried without a session')
})

Deno.test('readiness rejects booking mismatch before WMS request', async () => {
  let fetched = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { fetched = true; throw new Error('must not fetch') }) as typeof fetch
  try {
    const result = await verifyScannerReadiness({
      ...baseInput,
      bookingNumber: 'WRONG',
      admin: readyDatabase(),
    })
    assert(!result.ok, 'wrong booking must fail')
    assert(result.code === 'WRONG_BOOKING', `unexpected code: ${result.code}`)
    assert(!fetched, 'WMS must not be called for a mismatched booking')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('readiness passes only with exact verified WMS reservation state', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((request: RequestInfo | URL) => {
    assert(String(request).includes('reservation_id=BOOK-101'), 'canonical reservation id must be sent')
    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      reservation_id: 'BOOK-101',
      current_state: { reservation_id: 'BOOK-101', status: 'allocated' },
    }), { status: 200 }))
  }) as typeof fetch
  try {
    const result = await verifyScannerReadiness({ ...baseInput, admin: readyDatabase() })
    assert(result.ok, `expected READY, got ${result.code}`)
    assert(result.code === 'READY', `unexpected code: ${result.code}`)
    assert(result.reservationId === 'BOOK-101', 'canonical reservation must be returned')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('readiness fails closed on a successful but unverifiable WMS body', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))) as typeof fetch
  try {
    const result = await verifyScannerReadiness({ ...baseInput, admin: readyDatabase() })
    assert(!result.ok, 'unverifiable WMS response must fail')
    assert(result.code === 'WMS_RESERVATION_UNVERIFIED', `unexpected code: ${result.code}`)
  } finally {
    globalThis.fetch = originalFetch
  }
})
