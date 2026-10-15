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
const { handleRequest } = await import('../../supabase/functions/scanner-dispatch-api/index')

const id = (n: string) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`
const input = { schema: 'eventflow-scanner-dispatch-gateway.v1', scanner_contract_version: 'scanner_contract_v1', bookingId:id('1'),reservationId:id('2'),action:'COMMAND',operationId:id('a'),request:{command:'CREATE_PARCEL',expectedRevision:0,label:'Kolli 1'} }
const claims = { staffId: id('4'), organizationId: id('5'), sessionId: id('6'), releaseSha: env.SCANNER_RELEASE_SHA }
let fetchMock: ReturnType<typeof vi.fn>
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
  mocks.createClient.mockImplementation(() => ({ from: (table: string) => {
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query }, maybeSingle: async () => ({ data: table === 'staff_members' ? staff : booking, error: null }) }
    return query
  } }))
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'dispatch_commands_disabled' }), { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
})
describe('signed dispatch proxy boundary', () => {
  it('derives tenant/actor, signs exact bytes and preserves disabled owner response', async () => {
    const response = await handleRequest(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'dispatch_commands_disabled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/eventflow-scanner-dispatch-v1')
    expect(JSON.parse(options.body)).toMatchObject({ schema: 'eventflow-scanner-bundle-dispatch.v1', organizationId: claims.organizationId, actorId: claims.staffId, bookingNumber: 'B-1001' })
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
  it('forwards validated disabled read projection with exact booking identity', async () => {
    const read = {schema:input.schema,scanner_contract_version:input.scanner_contract_version,bookingId:input.bookingId,reservationId:input.reservationId,action:'READ'}
    const responseBody = {schema:'eventflow-scanner-dispatch-response.v1',organizationId:claims.organizationId,bookingId:input.bookingId,bookingNumber:'B-1001',reservationId:input.reservationId,dispatchCommandsEnabled:false,projection:{schema:'wms-dispatch-projection.v1',reservationId:input.reservationId,revision:0,pack:{fingerprint:'f'.repeat(64),lines:[]},state:null,controlCurrent:false,signatureValid:false,requiresRecontrol:false}}
    fetchMock.mockResolvedValue(new Response(JSON.stringify(responseBody)))
    expect(await (await handleRequest(request(read))).json()).toEqual(responseBody)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({...responseBody,bookingId:id('9')})))
    expect((await handleRequest(request(read))).status).toBe(502)
  })
  it('rejects client supplied actor or tenant', async()=>{
    expect((await handleRequest(request({...input,actorId:claims.staffId}))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects success receipt with wrong operation or revision', async()=>{
    const receipt={schema:'wms-dispatch-receipt.v1',status:'COMMITTED',operationId:id('9'),reservationId:input.reservationId,revision:1,parcelId:id('b'),state:{phase:'PACKING',parcels:[],counts:{}},serverTimestamp:new Date().toISOString(),replayed:false}
    const body={schema:'eventflow-scanner-dispatch-response.v1',organizationId:claims.organizationId,bookingId:input.bookingId,bookingNumber:'B-1001',reservationId:input.reservationId,dispatchCommandsEnabled:true,receipt}
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)))
    expect((await handleRequest(request())).status).toBe(502)
    receipt.operationId=input.operationId
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)))
    expect((await handleRequest(request())).status).toBe(200)
    receipt.revision=100
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)))
    expect((await handleRequest(request())).status).toBe(502)
  })
})
