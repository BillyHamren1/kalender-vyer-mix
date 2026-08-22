export type ScannerWmsStatus =
  | 'accepted'
  | 'rejected'
  | 'wrong_booking'
  | 'over_capacity'
  | 'not_found'
  | 'duplicate'
  | 'unknown'

const KNOWN = new Set<ScannerWmsStatus>([
  'accepted', 'rejected', 'wrong_booking', 'over_capacity', 'not_found', 'duplicate', 'unknown',
])

export const transientWmsStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500

const rejectionFrom = (body: any): ScannerWmsStatus => {
  const code = String(body?.code ?? body?.debugCode ?? '').toUpperCase()
  if (code === 'WRONG_BOOKING') return 'wrong_booking'
  if (code === 'OVER_CAPACITY') return 'over_capacity'
  if (code === 'NOT_FOUND') return 'not_found'
  return 'rejected'
}

/**
 * Interpret the WMS envelope fail-closed. A transport/server error wins over a
 * contradictory terminal body, and success=false can never become accepted.
 */
export const mapScannerWmsStatus = (httpStatus: number, body: any): ScannerWmsStatus => {
  if (transientWmsStatus(httpStatus)) return 'unknown'

  const explicitRaw = String(body?.status ?? '').toLowerCase()
  const explicit = KNOWN.has(explicitRaw as ScannerWmsStatus)
    ? explicitRaw as ScannerWmsStatus
    : null

  if (body?.success === false) {
    if (explicit && ['rejected', 'wrong_booking', 'over_capacity', 'not_found'].includes(explicit)) return explicit
    return rejectionFrom(body)
  }

  if (explicit) {
    if (explicit === 'accepted' && httpStatus !== 200 && httpStatus !== 201) return 'rejected'
    return explicit
  }

  if (httpStatus === 200 || httpStatus === 201) return 'accepted'
  if (httpStatus === 404) return 'not_found'
  if (httpStatus === 409 || httpStatus === 422) return rejectionFrom(body)
  return 'rejected'
}

export const wmsOperationIdFrom = (body: any): string | null => {
  const value = body?.operation_id ?? body?.operationId ?? body?.data?.operation_id ?? body?.data?.operationId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const wmsItemIdFrom = (body: any): string | null => {
  const value = body?.item_id ?? body?.itemId ?? body?.data?.item_id ?? body?.data?.itemId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const wmsReservationLineIdFrom = (body: any): string | null => {
  const value = body?.reservation_line_id ?? body?.reservationLineId
    ?? body?.data?.reservation_line_id ?? body?.data?.reservationLineId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Duplicate is a committed replay only with both an explicit replay marker and exact operation id. */
export const isSameOperationReplay = (body: any, expectedOperationId: string): boolean => {
  const marked = body?.replayed === true || body?.already_committed === true || body?.same_operation === true
  return marked && wmsOperationIdFrom(body) === expectedOperationId
}
