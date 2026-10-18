// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind } from 'typescript'
import { MESSAGE_SCHEMA, MESSAGE_ACTIONS, authorizeInternalMessages } from '../../supabase/functions/_shared/internal-messages'
import { signPlanningBrainRequest } from '../../supabase/functions/_shared/planning-brain-read-contract'

const org = '20000000-0000-4000-8000-000000000002'
const actor = '10000000-0000-4000-8000-000000000001'
const secret = 'synthetic-test-only-signing-key-at-least-32-characters'
const actions = ['register_push_token', 'unregister_push_token'] as const
type Row = Record<string, unknown>

function fakeDatabase() {
  const calls: { table: string; filters: Row; operation: string; payload?: Row }[] = []
  return {
    calls,
    async rpc(name: string) {
      if (name === 'consume_planning_brain_read_nonce') return { data: true, error: null }
      if (name === 'resolve_hub_actor_v1') return { data: { status: 'ok', mode: 'direct', localUserId: actor }, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
    from(table: string) {
      const call = { table, filters: {} as Row, operation: 'read', payload: undefined as Row | undefined }
      calls.push(call)
      function result() {
        if (table === 'user_roles') return { data: [{ role: 'projekt', organization_id: org }], error: null }
        if (table === 'staff_members') return { data: [{ id: 'staff-me', is_active: true }], error: null }
        if (table === 'device_tokens') return { data: [], error: null }
        throw new Error(`Unexpected table ${table}`)
      }
      const chain = {
        select() { return chain }, eq(key: string, value: unknown) { call.filters[key] = value; return chain },
        in() { return chain }, limit() { return chain }, order() { return chain },
        upsert(payload: Row) { call.operation = 'upsert'; call.payload = payload; return Promise.resolve({ error: null }) },
        delete() { call.operation = 'delete'; return chain },
        async maybeSingle() { return result() },
        async single() { return { data: { name: 'Synthetic actor' }, error: null } },
        then(resolve: (value: { data: unknown; error: unknown }) => unknown) { return Promise.resolve(result()).then(resolve) },
      }
      return chain
    },
  }
}

async function signed(action: string, data: unknown) {
  const db = fakeDatabase()
  const body = { schema: MESSAGE_SCHEMA, actorUserId: actor, organizationId: org, action, data }
  const rawBody = JSON.stringify(body), timestamp = String(Date.now()), nonce = crypto.randomUUID()
  const signature = await signPlanningBrainRequest(secret, timestamp, nonce, MESSAGE_SCHEMA + '\n' + rawBody)
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
  return new Function('corsHeaders', output + `\nreturn ${name}`)
}
const register = loadHandler('handleRegisterPushToken')({})
const unregister = loadHandler('handleUnregisterPushToken')({})

describe('HMAC signed push-token contract', () => {
  it('both push-token actions are part of MESSAGE_ACTIONS', () => {
    for (const action of actions) expect(MESSAGE_ACTIONS).toContain(action)
  })

  for (const action of actions) {
    it(`authorizes ${action} with server-resolved identity`, async () => {
      const { result } = await signed(action, { push_token: 'synthetic-token', platform: 'ios' })
      expect(result).toEqual({ staffId: 'staff-me', organizationId: org, userId: actor })
    })
  }

  it('register_push_token upserts scoped to verified staff and organization', async () => {
    const { result, db } = await signed('register_push_token', { push_token: 'synthetic-token-abc', platform: 'ios' })
    if ('error' in result) throw new Error('authorization failed')
    const res = await register(db, result.staffId, { push_token: 'synthetic-token-abc', platform: 'ios' }, result.organizationId)
    expect(res.status).toBe(200)
    const upsert = db.calls.find((c) => c.table === 'device_tokens' && c.operation === 'upsert')
    expect(upsert?.payload).toMatchObject({ staff_id: 'staff-me', organization_id: org, token: 'synthetic-token-abc', platform: 'ios' })
  })

  it('register_push_token rejects missing push_token with 400', async () => {
    const res = await register(fakeDatabase(), 'staff-me', {}, org)
    expect(res.status).toBe(400)
  })

  it('unregister_push_token deletes scoped to verified staff, token and organization', async () => {
    const { result, db } = await signed('unregister_push_token', { push_token: 'synthetic-token-abc' })
    if ('error' in result) throw new Error('authorization failed')
    const res = await unregister(db, result.staffId, { push_token: 'synthetic-token-abc' }, result.organizationId)
    expect(res.status).toBe(200)
    const del = db.calls.find((c) => c.table === 'device_tokens' && c.operation === 'delete')
    expect(del?.filters).toMatchObject({ staff_id: 'staff-me', token: 'synthetic-token-abc', organization_id: org })
  })

  it('unregister_push_token rejects missing push_token with 400', async () => {
    const res = await unregister(fakeDatabase(), 'staff-me', {}, org)
    expect(res.status).toBe(400)
  })
})
