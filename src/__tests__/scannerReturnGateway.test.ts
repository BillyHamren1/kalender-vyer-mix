import { describe, expect, it } from 'vitest'
import { buildBundleScannerReturn, parseScannerReturnCommand, validBundleReturnReceipt, parseScannerReturnProjection, buildBundleReturnProjection, validBundleReturnProjection } from '../../supabase/functions/_shared/scannerReturnGateway'
const id = (n: string) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`
const input = { schema: 'eventflow-scanner-return-gateway.v1', scanner_contract_version: 'scanner_contract_v1', operationId: `op-${id('a')}`, command: 'RETURN_INSTANCE', bookingId: id('1'), reservationId: id('2'), reservationLineId: id('3'), itemTypeId: id('4'), deviceId: 'tc22', scanValue: '00001234', quantity: 1, occurredAt: '2026-10-15T07:00:00.000Z', condition: 'ok', damageNote: null }
const actor = { organizationId: id('5'), staffId: id('6'), staffName: 'Lager', bookingNumber: 'B-1001' }
const owner = (patch = {}) => {
  const parsed = parseScannerReturnCommand({ ...input, ...patch })
  if (parsed.ok === false) throw new Error(parsed.error)
  return buildBundleScannerReturn({ ...actor, command: parsed.value })
}
const receipt = (patch = {}) => ({ schema: 'bundle-scanner-return-receipt.v1', operationId: input.operationId, bundleOperationId: id('7'), command: input.command, status: 'COMMITTED', canonicalIdentity: { organizationId: actor.organizationId, reservationId: input.reservationId, bookingNumber: actor.bookingNumber, reservationLineId: input.reservationLineId, itemTypeId: input.itemTypeId }, authoritativeReturnState: { returnedQuantity: 1, outstandingQuantity: 2, manualOutstandingQuantity: 0 }, itemInstance: { itemInstanceId: id('8'), status: 'available' }, reason: null, reasonDetail: null, serverTimestamp: input.occurredAt, ...patch })

describe('owner-backed return gateway', () => {
  it('retains leading zeroes and derives actor and organization only server-side', () => {
    expect(owner()).toMatchObject({ schema: 'eventflow-scanner-bundle-return.v1', command: 'RETURN_INSTANCE', scanValue: '00001234', itemInstanceId: null, packingSessionId: null, performedBy: actor.staffId, organizationId: actor.organizationId, condition: 'ok', damageNote: null })
  })
  it('supports explicit manual quantities without inventing item identities', () => {
    expect(owner({ command: 'RETURN_QUANTITY', itemTypeId: null, scanValue: null, quantity: 7 })).toMatchObject({ itemTypeId: null, quantity: 7, scanValue: null, command: 'RETURN_QUANTITY' })
  })
  it('forwards damaged-instance evidence', () => {
    expect(owner({ condition: 'damaged', damageNote: 'Trasigt ben' })).toMatchObject({ condition: 'damaged', damageNote: 'Trasigt ben' })
  })
  it.each([
    { organizationId: id('9') }, { performedBy: id('9') }, { reason: 'foo' },
    { schema: 'eventflow-scanner-command-gateway.v1' }, { command: 'UNPACK_INSTANCE' },
    { itemTypeId: null }, { itemTypeId: undefined }, { bookingId: 'local-id' },
    { command: 'RETURN_QUANTITY', scanValue: '00001234', quantity: 2 },
    { quantity: 2 }, { quantity: -1 }, { quantity: Infinity },
    { command: 'RETURN_QUANTITY', scanValue: null, quantity: 1001 },
    { condition: 'lost' }, { condition: 'damaged', damageNote: null },
    { damageNote: undefined }, { damageNote: 'a' }, { damageNote: ' bad ' },
    { scanner_contract_version: undefined }, { occurredAt: '2026-10-15T07:00:00' },
  ])('rejects unsafe or malformed request %#', patch => expect(parseScannerReturnCommand({ ...input, ...patch }).ok).toBe(false))
  it('validates receipt identity and state for the original operation', () => {
    expect(validBundleReturnReceipt(receipt(), owner())).toBe(true)
    expect(validBundleReturnReceipt(receipt({ status: 'ALREADY_COMMITTED' }), owner())).toBe(true)
    for (const key of ['organizationId', 'reservationId', 'reservationLineId', 'itemTypeId', 'bookingNumber']) {
      const r = receipt(); (r.canonicalIdentity as Record<string, unknown>)[key] = id('9')
      expect(validBundleReturnReceipt(r, owner())).toBe(false)
    }
  })
  it.each([
    { operationId: `op-${id('9')}` }, { bundleOperationId: 'not-an-id' }, { command: 'PACK_INSTANCE' },
    { authoritativeReturnState: { returnedQuantity: -1, outstandingQuantity: 0, manualOutstandingQuantity: 0 } },
    { authoritativeReturnState: { returnedQuantity: 1, outstandingQuantity: 0, manualOutstandingQuantity: 1 } },
    { authoritativeReturnState: { returnedQuantity: null, outstandingQuantity: null, manualOutstandingQuantity: null } },
    { itemInstance: null }, { itemInstance: { itemInstanceId: id('8'), status: 'in_repair' } },
    { status: 'REJECTED', reason: null }, { serverTimestamp: '2026-10-15' },
  ])('never accepts an ambiguous successful receipt %#', patch => expect(validBundleReturnReceipt(receipt(patch), owner())).toBe(false))
  it('accepts damaged and manual receipts only with matching semantics', () => {
    expect(validBundleReturnReceipt(receipt({ itemInstance: { itemInstanceId: id('8'), status: 'in_repair' } }), owner({ condition: 'damaged', damageNote: 'Trasigt ben' }))).toBe(true)
    const manual = owner({ command: 'RETURN_QUANTITY', itemTypeId: null, scanValue: null, quantity: 1 })
    expect(validBundleReturnReceipt(receipt({ command: 'RETURN_QUANTITY', canonicalIdentity: { ...receipt().canonicalIdentity, itemTypeId: null }, itemInstance: null }), manual)).toBe(true)
  })
  it('accepts typed rejections without fabricated quantities', () => {
    expect(validBundleReturnReceipt(receipt({ status: 'REJECTED', reason: 'NOT_OUT', authoritativeReturnState: { returnedQuantity: null, outstandingQuantity: null, manualOutstandingQuantity: null }, itemInstance: null }), owner())).toBe(true)
  })
})

const readInput = { schema: 'eventflow-scanner-return-read-gateway.v1', scanner_contract_version: 'scanner_contract_v1', bookingId: input.bookingId, reservationId: input.reservationId }
const readOwner = buildBundleReturnProjection({ organizationId: actor.organizationId, reservationId: input.reservationId, bookingNumber: actor.bookingNumber })
const projection = () => ({ ...readOwner, schema: 'eventflow-scanner-bundle-return-projection.v1', generatedAt: input.occurredAt, returnCommandsEnabled: false, lines: [{ reservationLineId: input.reservationLineId, itemTypeId: input.itemTypeId, returnedQuantity: 1, outstandingQuantity: 2, manualOutstandingQuantity: 1, instances: [{ itemInstanceId: id('8'), scanValue: '00001234', status: 'checked_out' }] }] })
describe('return projection', () => {
  it('accepts exact booking and reservation read scope', () => expect(parseScannerReturnProjection(readInput).ok).toBe(true))
  it.each([{ organizationId: id('9') }, { reservationId: 'bad' }, { scanner_contract_version: undefined }])('rejects unsafe scope %#', patch => expect(parseScannerReturnProjection({ ...readInput, ...patch }).ok).toBe(false))
  it('validates authoritative totals and instance identities', () => expect(validBundleReturnProjection(projection(), readOwner)).toBe(true))
  it('accepts separate package components sharing the canonical reservation line', () => {
    const result = projection()
    result.lines.push({ ...result.lines[0], itemTypeId: id('9'), instances: [{ itemInstanceId: id('a'), scanValue: '00009999', status: 'checked_out' }] })
    expect(validBundleReturnProjection(result, readOwner)).toBe(true)
    result.lines.push({ ...result.lines[1], instances: [{ itemInstanceId: id('b'), scanValue: '00008888', status: 'checked_out' }] })
    expect(validBundleReturnProjection(result, readOwner)).toBe(false)
  })
  it('rejects duplicates, wrong owner and inconsistent quantities', () => {
    const duplicate = projection(); duplicate.lines.push(duplicate.lines[0]); expect(validBundleReturnProjection(duplicate, readOwner)).toBe(false)
    const totals = projection(); totals.lines[0].outstandingQuantity = 0; expect(validBundleReturnProjection(totals, readOwner)).toBe(false)
    expect(validBundleReturnProjection({ ...projection(), organizationId: id('9') }, readOwner)).toBe(false)
    expect(validBundleReturnProjection({ ...projection(), generatedAt: '2026-10-15' }, readOwner)).toBe(false)
  })
})
