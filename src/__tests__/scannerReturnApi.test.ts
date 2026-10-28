// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScannerSignedToken } from '../../supabase/functions/_shared/scannerSignedAuth'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('https://esm.sh/@supabase/supabase-js@2.116.0', () => mocks)
const env: Record<string, string> = {
  SCANNER_TOKEN_SIGNING_SECRET: 's'.repeat(64), SCANNER_RELEASE_SHA: 'a'.repeat(40),
  EVENTFLOW_SCANNER_BUNDLE_SECRET: 'b'.repeat(64), SUPABASE_URL: 'https://local.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test',
}
vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } })
const { handleRequest } = await import('../../supabase/functions/scanner-return-api/index')
const { handleRequest: readRequest } = await import('../../supabase/functions/scanner-return-read-api/index')
const id = (n: string) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`
const input = { schema: 'eventflow-scanner-return-gateway.v1', scanner_contract_version: 'scanner_contract_v1', operationId: `op-${id('a')}`, command: 'RETURN_QUANTITY', bookingId: id('1'), reservationId: id('2'), reservationLineId: id('3'), itemTypeId: null, deviceId: 'tc22', scanValue: null, quantity: 1, occurredAt: '2026-10-15T07:00:00.000Z', condition: 'ok', damageNote: null }
const claims = { staffId: id('4'), organizationId: id('5'), sessionId: id('6'), releaseSha: env.SCANNER_RELEASE_SHA }
let fetchMock: ReturnType<typeof vi.fn>
let accessAllowed: boolean
const accessRpc = vi.fn()
let token: string
let staff: Record<string, unknown> | null
let booking: Record<string, unknown> | null
const filters: unknown[][] = []
const request = (body: unknown = input, credential = token) => new Request('https://local.invalid', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'content-type': 'application/json', 'x-eventflow-scanner-contract': 'scanner_contract_v1' }, body: JSON.stringify(body) })
beforeEach(async () => {
  token = await createScannerSignedToken(claims, env.SCANNER_TOKEN_SIGNING_SECRET)
  staff = { id: claims.staffId, organization_id: claims.organizationId, active_mobile_session_id: claims.sessionId, name: 'Lager' }
  booking = { id: input.bookingId, organization_id: claims.organizationId, booking_number: 'B-1001' }
  filters.length = 0
  accessAllowed = true
  accessRpc.mockImplementation(async () => ({ data: accessAllowed, error: null }))
  mocks.createClient.mockImplementation(() => ({ rpc: accessRpc, from: (table: string) => {
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query }, maybeSingle: async () => ({ data: table === 'staff_members' ? staff : booking, error: null }) }
    return query
  } }))
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'return_commands_disabled' }), { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
})
describe('signed return proxy boundary', () => {
  it('denies revoked HUB authority for signed command and read credentials', async () => {
    accessAllowed = false
    expect((await handleRequest(request())).status).toBe(403)
    expect((await readRequest(request({ schema: 'eventflow-scanner-return-read-gateway.v1', scanner_contract_version: 'scanner_contract_v1', bookingId: input.bookingId, reservationId: input.reservationId }))).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(accessRpc).toHaveBeenCalledWith('scanner_staff_access_allowed', { _staff_id: claims.staffId, _organization_id: claims.organizationId })
  })
  it('derives tenant/actor, signs exact bytes and preserves disabled owner response', async () => {
    const response = await handleRequest(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'return_commands_disabled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/eventflow-scanner-return-v1')
    expect(JSON.parse(options.body)).toMatchObject({ schema: 'eventflow-scanner-bundle-return.v1', organizationId: claims.organizationId, performedBy: claims.staffId, bookingNumber: 'B-1001', reservationLineId: input.reservationLineId, itemTypeId: null })
    expect(options.headers['x-scanner-signature']).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(filters).toContainEqual(['bookings', 'organization_id', claims.organizationId])
    expect(filters).toContainEqual(['staff_members', 'organization_id', claims.organizationId])
  })
  it('denies revoked sessions without owner calls', async () => {
    staff!.active_mobile_session_id = id('9')
    expect((await handleRequest(request())).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('denies foreign/missing bookings without owner calls', async () => {
    booking = null
    expect((await handleRequest(request())).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('denies unsigned credentials without owner calls', async () => {
    expect((await handleRequest(request(input, 'unsigned'))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not acknowledge malformed success', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })))
    expect((await handleRequest(request())).status).toBe(502)
  })
  it('forwards only validated read-only projection with disabled capability', async () => {
    const responseBody = { schema: 'eventflow-scanner-bundle-return-projection.v1', organizationId: claims.organizationId, reservationId: input.reservationId, bookingNumber: 'B-1001', generatedAt: input.occurredAt, returnCommandsEnabled: false, lines: [] }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(responseBody)))
    const response = await readRequest(request({ schema: 'eventflow-scanner-return-read-gateway.v1', scanner_contract_version: 'scanner_contract_v1', bookingId: input.bookingId, reservationId: input.reservationId }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(responseBody)
    expect(fetchMock.mock.calls[0][0]).toContain('/eventflow-scanner-return-projection-v1')
  })
})
