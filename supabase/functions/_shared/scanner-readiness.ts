// Shared fail-closed readiness gate for scanner mutations.
// Read-only: validates Planning scope and asks WMS for reservation state.

export interface ScannerReadinessInput {
  admin: any
  organizationId: string
  staffId: string
  packingId: string
  sessionId: string | null | undefined
  bookingNumber: string | null | undefined
  reservationId: string | null | undefined
  itemId?: string | null
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
    .select('id, wms_item_type_id, wms_sku, wms_identity_needs_repair, excluded')
    .eq('packing_id', packingId)
    .eq('organization_id', organizationId)
  if (itemsError) return fail('PACKING_ITEMS_UNVERIFIED', 'Packing rows could not be verified')
  const activeItems = (items ?? []).filter((row: any) => !row.excluded)
  if (activeItems.length === 0) return fail('PACKING_EMPTY', 'Packing has no scannable rows')
  const invalidIdentity = activeItems.find((row: any) =>
    row.wms_identity_needs_repair === true || !row.wms_item_type_id || !row.wms_sku
  )
  if (invalidIdentity) return fail('WMS_IDENTITY_UNVERIFIED', 'Every packing row must have verified WMS identity')
  if (itemId && !activeItems.some((row: any) => row.id === itemId)) {
    return fail('ITEM_SCOPE_MISMATCH', 'Packing item not found in verified packing scope')
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

  return {
    ok: true,
    code: 'READY',
    message: 'Scanner readiness verified',
    packing,
    bookingNumber: canonicalBookingNumber,
    reservationId: canonicalBookingNumber,
    wmsState,
  }
}
