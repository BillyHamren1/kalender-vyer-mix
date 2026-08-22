export interface CanonicalReservationLine {
  reservationLineId: string
  sourceBookingProductId: string | null
  itemTypeId: string | null
  sku: string | null
  quantity: number | null
  raw: any
}

const nonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const firstLineCollection = (body: any): any[] => {
  const state = body?.current_state ?? body?.data?.current_state ?? null
  const reservation = body?.reservation ?? body?.data?.reservation ?? null
  const candidates = [
    body?.reservation_lines,
    body?.lines,
    state?.reservation_lines,
    state?.lines,
    state?.items,
    reservation?.lines,
    body?.data?.reservation_lines,
    body?.data?.lines,
  ]
  return candidates.find(Array.isArray) ?? []
}

export const reservationLinesFrom = (body: any): CanonicalReservationLine[] =>
  firstLineCollection(body)
    .map((entry: any): CanonicalReservationLine | null => {
      const line = entry?.data && typeof entry.data === 'object'
        ? { ...entry, ...entry.data }
        : entry
      const reservationLineId = nonEmptyString(
        line?.reservation_line_id,
        line?.reservationLineId,
        line?.line_id,
        line?.id,
      )
      if (!reservationLineId) return null
      return {
        reservationLineId,
        sourceBookingProductId: nonEmptyString(
          line?.source_booking_product_id,
          line?.sourceBookingProductId,
          line?.booking_product_id,
          line?.metadata?.source_booking_product_id,
        ),
        itemTypeId: nonEmptyString(
          line?.item_type_id,
          line?.itemTypeId,
          line?.inventory_item_type_id,
        ),
        sku: nonEmptyString(line?.sku, line?.item_type_sku),
        quantity: Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : null,
        raw: line,
      }
    })
    .filter((line: CanonicalReservationLine | null): line is CanonicalReservationLine => line !== null)
