// Shared fail-closed readiness gate for scanner mutations.
// Read-only: validates Planning scope and asks WMS for reservation state.

import { reservationLinesFrom, type CanonicalReservationLine } from './reservation-line-identity.ts'

export interface ScannerReadinessInput {
  admin: any
  organizationId: string
  staffId: string
  packingId: string
  sessionId: string | null | undefined
  bookingNumber: string | null | undefined
  reservationId: string | null | undefined
  itemId?: string | null
  reservationLineId?: string | null
  requireReservationLine?: boolean
  wmsBaseUrl: string | null | undefined
  apiKey: string | null | undefined
}

export interface ScannerReadinessResult {
  ok: boolean
  code: string
  message: string
  packing?: any
  bookingNumber?: string
  reservationId?: string
  reservationLine?: CanonicalReservationLine
  wmsState?: any
}

const fail = (code: string, message: string): ScannerReadinessResult => ({
  ok: false,
  code,
  message,
})

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '')

const reservationIdentityFrom = (body: any): string | null => {
  const state = body?.current_state ?? body?.data?.current_state ?? null
  const value =
    body?.reservation_id ??
    body?.data?.reservation_id ??
    state?.reservation_id ??
    state?.booking_number ??
    null
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function verifyScannerReadiness(
  input: ScannerReadinessInput,
): Promise<ScannerReadinessResult> {
  const {
    admin,
    organizationId,
    staffId,
    packingId,
    sessionId,
    bookingNumber,
    reservationId,
    itemId,
    reservationLineId,
    requireReservationLine = false,
    wmsBaseUrl,
    apiKey,
  } = input

  if (!organizationId || !staffId) return fail('IDENTITY_UNVERIFIED', 'Scanner identity could not be verified')
  if (!sessionId) return fail('PACKING_SESSION_REQUIRED', 'Active packing session required')

  const { data: packing, error: packingError } = await admin
    .from('packing_projects')
    .select('id, organization_id, booking_id, status, blocked_by_short_notice_change, needs_packing_review')
    .eq('id', packingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (packingError || !packing) return fail('PACKING_NOT_FOUND', 'Packing not found in organization')
  if (!packing.booking_id) return fail('BOOKING_SCOPE_UNVERIFIED', 'Packing has no booking identity')
  if (packing.blocked_by_short_notice_change || packing.needs_packing_review) {
    return fail('PACKING_REVIEW_REQUIRED', 'Packing has unacknowledged changes')
  }

  const { data: session, error: sessionError } = await admin
    .from('packing_work_sessions')
    .select('id, packing_id, staff_id, organization_id, status')
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (sessionError || !session) return fail('PACKING_SESSION_NOT_FOUND', 'Packing session not found')
  if (session.packing_id !== packingId) return fail('PACKING_SESSION_WRONG_PACKING', 'Session belongs to another packing')
  if (session.staff_id !== staffId) return fail('PACKING_SESSION_WRONG_STAFF', 'Session belongs to another user')
  if (session.status !== 'active') return fail('PACKING_SESSION_NOT_ACTIVE', 'Packing session is not active')

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select('id, booking_number, organization_id')
    .eq('id', packing.booking_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  const canonicalBookingNumber = typeof booking?.booking_number === 'string'
    ? booking.booking_number.trim()
    : ''
  if (bookingError || !booking?.id || !canonicalBookingNumber) {
    return fail('BOOKING_SCOPE_UNVERIFIED', 'Booking identity could not be verified in organization')
  }
  if (!bookingNumber || String(bookingNumber).trim() !== canonicalBookingNumber) {
    return fail('WRONG_BOOKING', 'Booking number does not match packing')
  }
  if (!reservationId || String(reservationId).trim() !== canonicalBookingNumber) {
    return fail('RESERVATION_UNVERIFIED', 'Reservation identity does not match booking')
  }

  const { count: pendingShortNotice, error: pendingError } = await admin
    .from('packing_change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('packing_id', packingId)
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .eq('urgency', 'short_notice')
  if (pendingError) return fail('CHANGE_READINESS_UNVERIFIED', 'Packing changes could not be verified')
  if ((pendingShortNotice ?? 0) > 0) return fail('SHORT_NOTICE_ACK_REQUIRED', 'Short-notice changes must be acknowledged')

  const { data: items, error: itemsError } = await admin
    .from('packing_list_items')
    .select('id, booking_product_id, wms_item_type_id, wms_sku, wms_identity_needs_repair, excluded')
    .eq('packing_id', packingId)
    .eq('organization_id', organizationId)
  if (itemsError) return fail('PACKING_ITEMS_UNVERIFIED', 'Packing rows could not be verified')
  const activeItems = (items ?? []).filter((row: any) => !row.excluded)
  if (activeItems.length === 0) return fail('PACKING_EMPTY', 'Packing has no scannable rows')
  const invalidIdentity = activeItems.find((row: any) =>
    row.wms_identity_needs_repair === true || !row.wms_item_type_id || !row.wms_sku
  )
  if (invalidIdentity) return fail('WMS_IDENTITY_UNVERIFIED', 'Every packing row must have verified WMS identity')
  const targetItem = itemId ? activeItems.find((row: any) => row.id === itemId) ?? null : null
  if (itemId && !targetItem) return fail('ITEM_SCOPE_MISMATCH', 'Packing item not found in verified packing scope')
  if (requireReservationLine && !targetItem) {
    return fail('PACKING_ITEM_REQUIRED', 'Exact packing item is required for scanner mutation')
  }

  let targetBookingProduct: any = null
  if (requireReservationLine) {
    if (!reservationLineId) return fail('RESERVATION_LINE_REQUIRED', 'Exact reservation line is required')
    if (!targetItem?.booking_product_id) {
      return fail('BOOKING_PRODUCT_REQUIRED', 'Packing item has no exact booking row identity')
    }
    const { data: bookingProduct, error: bookingProductError } = await admin
      .from('booking_products')
      .select('id, booking_id, organization_id, inventory_item_type_id, sku')
      .eq('id', targetItem.booking_product_id)
      .eq('booking_id', packing.booking_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (bookingProductError || !bookingProduct) {
      return fail('BOOKING_PRODUCT_SCOPE_MISMATCH', 'Packing row does not belong to verified booking')
    }
    targetBookingProduct = bookingProduct
  }

  if (!wmsBaseUrl || !apiKey) return fail('WMS_NOT_CONFIGURED', 'WMS readiness endpoint is not configured')
  let wmsBody: any
  try {
    const response = await fetch(
      `${normalizeBaseUrl(wmsBaseUrl)}/get-reservation-allocations?reservation_id=${encodeURIComponent(canonicalBookingNumber)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'x-organization-id': organizationId,
        },
        signal: AbortSignal.timeout(8000),
      },
    )
    const text = await response.text()
    try { wmsBody = JSON.parse(text) } catch { wmsBody = { raw: text } }
    if (!response.ok || wmsBody?.success === false) {
      return fail('WMS_RESERVATION_UNAVAILABLE', wmsBody?.error || `WMS readiness returned ${response.status}`)
    }
  } catch (error) {
    return fail('WMS_READINESS_UNAVAILABLE', `WMS readiness could not be verified: ${String(error)}`)
  }

  const wmsReservationId = reservationIdentityFrom(wmsBody)
  const wmsState = wmsBody?.current_state ?? wmsBody?.data?.current_state ?? null
  const explicitExists = wmsBody?.exists === true || wmsBody?.found === true || wmsBody?.data?.exists === true
  if (wmsReservationId && wmsReservationId !== canonicalBookingNumber) {
    return fail('WMS_WRONG_RESERVATION', 'WMS returned another reservation identity')
  }
  if (!wmsReservationId && !wmsState && !explicitExists) {
    return fail('WMS_RESERVATION_UNVERIFIED', 'WMS did not return verifiable reservation state')
  }

  let reservationLine: CanonicalReservationLine | undefined
  if (requireReservationLine) {
    const lines = reservationLinesFrom(wmsBody)
    const byId = lines.filter((line) => line.reservationLineId === String(reservationLineId).trim())
    if (byId.length !== 1) {
      return fail(
        byId.length > 1 ? 'WMS_RESERVATION_LINE_AMBIGUOUS' : 'WMS_RESERVATION_LINE_NOT_FOUND',
        'Exact reservation line could not be verified in WMS',
      )
    }
    reservationLine = byId[0]
    const bySource = lines.filter((line) => line.sourceBookingProductId === targetBookingProduct.id)
    if (bySource.length !== 1 || reservationLine.sourceBookingProductId !== targetBookingProduct.id) {
      return fail('WMS_RESERVATION_LINE_SOURCE_MISMATCH', 'Reservation line does not match exact booking row')
    }
    if (reservationLine.itemTypeId !== targetItem.wms_item_type_id) {
      return fail('WMS_RESERVATION_LINE_ITEM_MISMATCH', 'Reservation line item type does not match packing row')
    }
    if (
      reservationLine.sku &&
      targetItem.wms_sku &&
      reservationLine.sku.toLowerCase() !== String(targetItem.wms_sku).toLowerCase()
    ) {
      return fail('WMS_RESERVATION_LINE_SKU_MISMATCH', 'Reservation line SKU does not match packing row')
    }
  }

  return {
    ok: true,
    code: 'READY',
    message: 'Scanner readiness verified',
    packing,
    bookingNumber: canonicalBookingNumber,
    reservationId: canonicalBookingNumber,
    wmsState,
    reservationLine,
  }
}
