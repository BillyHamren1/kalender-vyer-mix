// Pure helpers for short-notice booking notifications.
// Speglas av src/lib/notifications/shortNoticeBooking.ts (samma logik, samma tester).

export const SHORT_NOTICE_DAYS = 7;

/** Roller som ska få notisen om en bokning kommer in med kort varsel. */
export const SHORT_NOTICE_NOTIFY_ROLES = ['admin', 'projekt', 'forsaljning'] as const;

export type ShortNoticeRole = (typeof SHORT_NOTICE_NOTIFY_ROLES)[number];

export interface ShortNoticeInput {
  /** ISO-datum (YYYY-MM-DD) eller null. Riggdagen är primärt fält. */
  rigdaydate?: string | null;
  /** Fallback om riggdag saknas. */
  eventdate?: string | null;
  /** "Nu" — injectas i tester. */
  now?: Date;
}

export interface ShortNoticeResult {
  isShortNotice: boolean;
  daysUntilRig: number | null;
  effectiveDate: string | null;
}

/**
 * En bokning räknas som "kort varsel" om riggdagen (eller eventdate som
 * fallback) ligger inom SHORT_NOTICE_DAYS från idag, inklusive idag och
 * inklusive datum som redan passerat (då är varselet ännu kortare).
 */
export function evaluateShortNotice(input: ShortNoticeInput): ShortNoticeResult {
  const now = input.now ?? new Date();
  const reference = input.rigdaydate ?? input.eventdate ?? null;

  if (!reference) {
    return { isShortNotice: false, daysUntilRig: null, effectiveDate: null };
  }

  const target = parseDateOnly(reference);
  if (!target) {
    return { isShortNotice: false, daysUntilRig: null, effectiveDate: reference };
  }

  const today = startOfDayUtc(now);
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

  return {
    isShortNotice: days <= SHORT_NOTICE_DAYS,
    daysUntilRig: days,
    effectiveDate: reference,
  };
}

function parseDateOnly(value: string): Date | null {
  // Accepterar YYYY-MM-DD eller full ISO.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Mänskligt formaterad "om X dagar" / "idag" / "imorgon" / "för X dagar sedan". */
export function formatDaysUntil(days: number | null): string {
  if (days === null) return 'okänt datum';
  if (days === 0) return 'idag';
  if (days === 1) return 'imorgon';
  if (days < 0) return `för ${Math.abs(days)} dagar sedan`;
  return `om ${days} dagar`;
}

export interface BookingNotificationPayload {
  bookingId: string;
  bookingNumber?: string | null;
  client?: string | null;
  rigdaydate?: string | null;
  eventdate?: string | null;
  deliveryaddress?: string | null;
  daysUntilRig: number | null;
}

export function buildInAppMessage(p: BookingNotificationPayload): string {
  const num = p.bookingNumber ? ` #${p.bookingNumber}` : '';
  const when = formatDaysUntil(p.daysUntilRig);
  const where = p.deliveryaddress ? ` @ ${p.deliveryaddress}` : '';
  const client = p.client || 'Okänd kund';
  return `⚡ Kort varsel${num}: ${client} – riggning ${when}${where}.`;
}

export function buildEmailSubject(p: BookingNotificationPayload): string {
  const num = p.bookingNumber ? `#${p.bookingNumber} ` : '';
  return `Kort varsel: ${num}${p.client || 'Ny bokning'} – riggning ${formatDaysUntil(p.daysUntilRig)}`;
}
