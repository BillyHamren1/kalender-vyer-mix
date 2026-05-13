export const normalizeBookingStatus = (status: string | null | undefined): string => {
  const s = (status || 'PENDING')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[!.,:;]+$/g, '');

  if (s === 'BEKRÄFTAD' || s === 'CONFIRMED') return 'CONFIRMED';
  if (s === 'AVBOKAD' || s === 'CANCELLED') return 'CANCELLED';
  if (s === 'DRAFT' || s === 'UTKAST' || s === 'OFFER' || s === 'OFFERT') return 'OFFER';
  return s;
};