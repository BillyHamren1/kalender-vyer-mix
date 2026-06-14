export const resolvePackingSyncBookingIds = (
  bookingId: string | null | undefined,
  linkedBookingIds: Array<string | null | undefined>,
): string[] => {
  return Array.from(new Set([bookingId, ...linkedBookingIds].filter((id): id is string => !!id)));
};

export const isMultiBookingPacking = (
  bookingId: string | null | undefined,
  linkedBookingIds: Array<string | null | undefined>,
): boolean => resolvePackingSyncBookingIds(bookingId, linkedBookingIds).length > 1;