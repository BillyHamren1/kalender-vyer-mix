import { describe, expect, it } from 'vitest'
import {
  parseScannerParcelQuery,
  parseScannerParcelRequest,
  scannerParcelFingerprint,
} from '../../supabase/functions/_shared/scannerParcelContract'

const ids = {
  packingId: '11111111-1111-4111-8111-111111111111',
  bookingId: '22222222-2222-4222-8222-222222222222',
  reservationId: '33333333-3333-4333-8333-333333333333',
  parcelId: '44444444-4444-4444-8444-444444444444',
  packingListItemId: '55555555-5555-4555-8555-555555555555',
}

const base = {
  schema: 'eventflow-scanner-parcel.v1',
  operationId: 'op-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  packingId: ids.packingId,
  bookingId: ids.bookingId,
  reservationId: ids.reservationId,
  deviceId: 'tc22-warehouse-1',
  occurredAt: '2026-09-14T16:00:00.000Z',
}

describe('Scanner parcel contract', () => {
  it('accepts the five operator parcel commands with exact fields', () => {
    const requests = [
      { ...base, command: 'CREATE_PARCEL', parcelId: null, packingListItemId: null, quantity: null, reason: null },
      { ...base, command: 'ASSIGN_ITEM', parcelId: ids.parcelId, packingListItemId: ids.packingListItemId, quantity: 1, reason: null },
      { ...base, command: 'UNASSIGN_ITEM', parcelId: ids.parcelId, packingListItemId: ids.packingListItemId, quantity: 1, reason: null },
      { ...base, command: 'SEAL_PARCEL', parcelId: ids.parcelId, packingListItemId: null, quantity: null, reason: null },
      { ...base, command: 'REOPEN_PARCEL', parcelId: ids.parcelId, packingListItemId: null, quantity: null, reason: 'Fel kolli' },
    ]
    for (const request of requests) expect(parseScannerParcelRequest(request).ok).toBe(true)
  })

  it('rejects client-controlled extra fields and incomplete commands', () => {
    expect(parseScannerParcelRequest({
      ...base,
      command: 'ASSIGN_ITEM',
      parcelId: ids.parcelId,
      packingListItemId: ids.packingListItemId,
      quantity: 1,
      reason: null,
      organizationId: 'foreign-org',
    })).toEqual({ ok: false, error: 'unexpected_field' })

    expect(parseScannerParcelRequest({
      ...base,
      command: 'REOPEN_PARCEL',
      parcelId: ids.parcelId,
      packingListItemId: null,
      quantity: null,
      reason: 'x',
    })).toEqual({ ok: false, error: 'invalid_reason' })
  })

  it('accepts only the explicit projection read query', () => {
    expect(parseScannerParcelQuery({
      schema: 'eventflow-scanner-parcel.v1',
      action: 'GET_PROJECTION',
      packingId: ids.packingId,
      bookingId: ids.bookingId,
      reservationId: ids.reservationId,
    }).ok).toBe(true)

    expect(parseScannerParcelQuery({
      schema: 'eventflow-scanner-parcel.v1',
      action: 'GET_PROJECTION',
      packingId: ids.packingId,
      bookingId: ids.bookingId,
      reservationId: ids.reservationId,
      organizationId: 'client-controlled',
    })).toEqual({ ok: false, error: 'unexpected_field' })
  })

  it('fingerprints the complete immutable command envelope', async () => {
    const parsed = parseScannerParcelRequest({
      ...base,
      command: 'ASSIGN_ITEM',
      parcelId: ids.parcelId,
      packingListItemId: ids.packingListItemId,
      quantity: 1,
      reason: null,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const first = await scannerParcelFingerprint(parsed.value)
    const second = await scannerParcelFingerprint({ ...parsed.value, quantity: 2 })
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toBe(second)
  })
})
