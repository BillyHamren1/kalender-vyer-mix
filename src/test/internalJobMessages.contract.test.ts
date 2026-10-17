// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind } from 'typescript'
import { MESSAGE_SCHEMA, MESSAGE_ACTIONS, authorizeInternalMessages } from '../../supabase/functions/_shared/internal-messages'
import { signPlanningBrainRequest } from '../../supabase/functions/_shared/planning-brain-read-contract'

const org = '20000000-0000-4000-8000-000000000002'
const actor = '10000000-0000-4000-8000-000000000001'
const bookingId = '30000000-0000-4000-8000-000000000003'
const secret = 'synthetic-test-only-signing-key-at-least-32-characters'
const actions = ['get_job_messages', 'send_job_message', 'mark_job_read'] as const
type Options = { foreignBooking?: boolean; bookingError?: boolean; noRole?: boolean; replay?: boolean }
type Row = Record<string, unknown>
type QueryResult = { data: unknown; error: unknown }
function fakeDatabase(options: Options = {}) {
  const calls: { table: string; filters: Row; operation: string; payload?: Row }[] = []
  const rpcCalls: { name: string; args: Row }[] = []
  const stored: Row[] = []
  return {
    calls, rpcCalls, stored,
    async rpc(name: string, args: Row) {
      rpcCalls.push({ name, args })
      if (name === 'consume_planning_brain_read_nonce') return { data: !options.replay, error: null }
      if (name === 'resolve_hub_actor_v1') return { data: { status: 'ok', mode: 'direct', localUserId: actor }, error: null }
      if (name === 'has_planning_access') return { data: true, error: null }
      if (name === 'mark_job_thread_read') return { data: 1, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
    from(table: string) {
      const call = { table, filters: {} as Row, operation: 'read', payload: undefined as Row | undefined }
      calls.push(call)
      function result() {
        if (table === 'user_roles') return { data: options.noRole ? [] : [{ role: 'projekt', organization_id: org }], error: null }
        if (table === 'staff_members') return { data: [{ id: 'staff-me', is_active: true }], error: null }
        if (table === 'bookings') return { data: options.foreignBooking ? null : { id: bookingId }, error: options.bookingError ? {} : null }
        if (table === 'job_messages') return { data: stored, error: null }
        if (table === 'jobs' || table === 'booking_staff_assignments') return { data: [], error: null }
        throw new Error(`Unexpected table ${table}`)
      }
      const chain = {
        select() { return chain }, eq(key: string, value: unknown) { call.filters[key] = value; return chain },
        in() { return chain }, limit() { return chain }, order() { return chain }, lt() { return chain },
        insert(payload: Row) { call.operation = 'insert'; call.payload = payload; stored.push({ ...payload, id: 'message-1', created_at: '2026-10-17T00:00:00Z' }); return chain },
        async maybeSingle() { return result() },
        async single() { return { data: table === 'staff_members' ? { name: 'Synthetic actor' } : stored[0], error: null } },
        then(resolve: (value: QueryResult) => unknown) { return Promise.resolve(result()).then(resolve) },
      }
      return chain
    },
  }
}
async function signed(action: string, data: unknown, options: Options = {}, wrongKey = false) {
  const db = fakeDatabase(options)
  const body = { schema: MESSAGE_SCHEMA, actorUserId: actor, organizationId: org, action, data }
  const rawBody = JSON.stringify(body), timestamp = String(Date.now()), nonce = crypto.randomUUID()
  const signature = await signPlanningBrainRequest(wrongKey ? 'wrong-key' : secret, timestamp, nonce, MESSAGE_SCHEMA + '\n' + rawBody)
  const result = await authorizeInternalMessages({ body, rawBody, secret, supabase: db, method: 'POST', headers: new Headers({
    'x-internal-messages-timestamp': timestamp, 'x-internal-messages-nonce': nonce, 'x-internal-messages-signature': signature,
  }) })
  return { result, db }
}

// Execute the existing production handlers, not a rewritten mock implementation.
const source = readFileSync('supabase/functions/mobile-app-api/index.ts', 'utf8')
function loadHandler(name: string) {
  const start = source.indexOf(`async function ${name}(`)
  if (start < 0) throw new Error(`Missing production handler ${name}`)
  const next = source.indexOf('\nasync function ', start + 1)
  const output = transpileModule(source.slice(start, next < 0 ? undefined : next), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  return new Function('corsHeaders', 'assertJobAccess', 'buildMessagePreview', output + `\nreturn ${name}`)
}
const gate = loadHandler('assertJobAccess')({}, undefined, undefined)
const get = loadHandler('handleGetJobMessages')({}, gate, undefined)
const send = loadHandler('handleSendJobMessage')({}, gate, () => 'Synthetic')
const mark = loadHandler('handleMarkJobRead')({}, gate, undefined)

describe('HMAC signed job-message contract', () => {
  for (const action of actions) {
    it(`authorizes ${action} with server-resolved identity and scoped booking`, async () => {
      expect(MESSAGE_ACTIONS).toContain(action)
      const { result, db } = await signed(action, { booking_id: bookingId, ...(action === 'send_job_message' ? { content: 'Hej' } : {}) })
      expect(result).toEqual({ staffId: 'staff-me', userId: actor, organizationId: org })
      expect(db.calls.find(call => call.table === 'bookings')?.filters).toEqual({ id: bookingId, organization_id: org })
    })
    it(`rejects cross-organization ${action}`, async () => {
      const { result, db } = await signed(action, { booking_id: bookingId, ...(action === 'send_job_message' ? { content: 'Hej' } : {}) }, { foreignBooking: true })
      expect(result).toEqual({ status: 403, error: 'job_not_authorized' })
      expect(db.stored).toHaveLength(0)
    })
  }
  it('fails closed on booking lookup error', async () => {
    expect((await signed('get_job_messages', { booking_id: bookingId }, { bookingError: true })).result).toEqual({ status: 503, error: 'booking_lookup_failed' })
  })
  it('rejects forged signatures, replay and missing organization membership', async () => {
    expect((await signed('get_job_messages', { booking_id: bookingId }, {}, true)).result).toMatchObject({ status: 401 })
    expect((await signed('get_job_messages', { booking_id: bookingId }, { replay: true })).result).toMatchObject({ status: 401 })
    expect((await signed('get_job_messages', { booking_id: bookingId }, { noRole: true })).result).toMatchObject({ status: 403 })
  })
  it('rejects missing targets, caller identity overrides and malformed data', async () => {
    for (const data of [{}, { booking_id: bookingId, sender_id: actor }, { booking_id: bookingId, organization_id: org }, { booking_id: 'x),id.gt.0' }, []]) {
      expect((await signed('mark_job_read', data)).result).toMatchObject({ status: 400 })
    }
  })
  it('validates text sends and bounded pagination', async () => {
    for (const content of ['', '  ', 42, 'x'.repeat(10001)]) expect((await signed('send_job_message', { booking_id: bookingId, content })).result).toMatchObject({ status: 400 })
    for (const data of [{ limit: 101 }, { limit: 1.5 }, { limit: 0 }, { before: 'invalid' }]) expect((await signed('get_job_messages', { booking_id: bookingId, ...data })).result).toMatchObject({ status: 400 })
    expect((await signed('get_job_messages', { booking_id: bookingId, limit: 100, before: '2026-10-17T00:00:00Z' })).result).toMatchObject({ organizationId: org })
  })
  it('routes an authorized send, read and read receipt through the existing production handlers', async () => {
    const { result, db } = await signed('send_job_message', { booking_id: bookingId, content: ' Hej team ' })
    if ('error' in result) throw new Error(result.error)
    const sent = await send(db, result.staffId, { booking_id: bookingId, content: ' Hej team ' }, result.organizationId, result.userId)
    expect(sent.status).toBe(201)
    expect((await sent.json()).message).toMatchObject({ content: 'Hej team', booking_id: bookingId, organization_id: org, sender_id: 'staff-me' })
    const read = await get(db, result.staffId, { booking_id: bookingId }, result.organizationId, result.userId)
    expect(read.status).toBe(200)
    expect((await read.json()).messages).toHaveLength(1)
    const receipt = await mark(db, result.staffId, { booking_id: bookingId }, result.organizationId, result.userId)
    expect(receipt.status).toBe(200)
    expect(await receipt.json()).toEqual({ success: true, updated: 1 })
    expect(db.rpcCalls.find(call => call.name === 'mark_job_thread_read')?.args).toEqual({ _org_id: org, _booking_id: bookingId, _my_ids: ['staff-me', actor] })
    expect(db.calls.filter(call => call.table === 'job_messages' && call.operation === 'read').every(call => call.filters.organization_id === org && call.filters.booking_id === bookingId)).toBe(true)
  })
})