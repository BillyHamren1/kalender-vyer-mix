export interface LargeProjectBookingLabelInput {
  booking_id: string;
  display_name?: string | null;
  booking?: {
    client?: string | null;
    booking_number?: string | null;
  } | null;
}

const GENERIC_BOOKING_LABEL_PATTERNS = [/^bokning$/i, /^bokning\s+[0-9a-f-]{6,}$/i, /^bokning\s+undefined$/i];

export const isMeaningfulBookingDisplayName = (displayName?: string | null) => {
  const normalized = displayName?.trim();
  if (!normalized) return false;

  return !GENERIC_BOOKING_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const getLargeProjectBookingLabel = ({
  booking_id,
  display_name,
  booking,
}: LargeProjectBookingLabelInput) => {
  const client = booking?.client?.trim();
  const bookingNumber = booking?.booking_number?.trim();
  const normalizedDisplayName = display_name?.trim();

  if (client) {
    return bookingNumber ? `${client} (#${bookingNumber})` : client;
  }

  if (isMeaningfulBookingDisplayName(normalizedDisplayName)) {
    if (bookingNumber && !normalizedDisplayName.includes(bookingNumber)) {
      return `${normalizedDisplayName} (#${bookingNumber})`;
    }

    return normalizedDisplayName;
  }

  if (bookingNumber) {
    return `Bokning #${bookingNumber}`;
  }

  return `Bokning ${booking_id.slice(0, 8)}`;
};