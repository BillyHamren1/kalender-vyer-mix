export interface ReservationLineLookup {
  bookingProductId?: string | null;
  serialNumber?: string | null;
  sku?: string | null;
  itemTypeId?: string | null;
  reservationLineId?: string | null;
}

export interface ReservationLineCandidate {
  reservation_line_id: string;
  source_booking_product_id: string | null;
  item_type_id?: string | null;
  sku?: string | null;
}

export interface ReservationAllocationIdentity {
  serial_number: string;
  reservation_line_id?: string | null;
}

export type ReservationLineResolution =
  | { ok: true; reservationLineId: string; sourceBookingProductId: string }
  | { ok: false; code: 'RESERVATION_LINE_MISSING' | 'RESERVATION_LINE_AMBIGUOUS'; message: string };

/** Resolve one WMS reservation line without depending on array order. */
export const resolveExactReservationLine = (
  reservationLines: ReservationLineCandidate[],
  allocations: ReservationAllocationIdentity[],
  lookup: ReservationLineLookup,
): ReservationLineResolution => {
  const normalizedSerial = (lookup.serialNumber || '').trim().toUpperCase();
  const allocationLineIds = normalizedSerial
    ? allocations
        .filter((allocation) => allocation.serial_number.trim().toUpperCase() === normalizedSerial)
        .map((allocation) => allocation.reservation_line_id)
        .filter((id): id is string => Boolean(id?.trim()))
    : [];

  const uniqueAllocationLineIds = new Set(allocationLineIds);
  const requestedLineId = lookup.reservationLineId?.trim() ||
    (uniqueAllocationLineIds.size === 1 ? allocationLineIds[0] : null);
  const bookingProductId = lookup.bookingProductId?.trim() || null;
  const sku = lookup.sku?.trim().toLowerCase() || null;
  const itemTypeId = lookup.itemTypeId?.trim().toLowerCase() || null;

  let candidates = reservationLines.filter(
    (line) => Boolean(line.reservation_line_id?.trim() && line.source_booking_product_id?.trim()),
  );
  if (requestedLineId) candidates = candidates.filter((line) => line.reservation_line_id === requestedLineId);
  if (bookingProductId) candidates = candidates.filter((line) => line.source_booking_product_id === bookingProductId);
  if (!bookingProductId && !requestedLineId && itemTypeId) {
    candidates = candidates.filter((line) => line.item_type_id?.trim().toLowerCase() === itemTypeId);
  }
  if (!bookingProductId && !requestedLineId && !itemTypeId && sku) {
    candidates = candidates.filter((line) => line.sku?.trim().toLowerCase() === sku);
  }

  if (candidates.length === 1 && candidates[0].source_booking_product_id) {
    return {
      ok: true,
      reservationLineId: candidates[0].reservation_line_id,
      sourceBookingProductId: candidates[0].source_booking_product_id,
    };
  }
  if (candidates.length > 1 || uniqueAllocationLineIds.size > 1) {
    return {
      ok: false,
      code: 'RESERVATION_LINE_AMBIGUOUS',
      message: 'Flera reservationsrader matchar – välj exakt packningsrad',
    };
  }
  return {
    ok: false,
    code: 'RESERVATION_LINE_MISSING',
    message: 'Exakt reservationsrad kunde inte verifieras',
  };
};
