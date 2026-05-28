// Frontend-spegling av supabase/functions/_shared/shortNoticeBooking.ts.
// Lägg eventuella ändringar i båda filerna samtidigt.

export const SHORT_NOTICE_DAYS = 7;
export const SHORT_NOTICE_NOTIFY_ROLES = ['admin', 'projekt', 'forsaljning'] as const;
export type ShortNoticeRole = (typeof SHORT_NOTICE_NOTIFY_ROLES)[number];

export interface ShortNoticeInput {
  rigdaydate?: string | null;
  eventdate?: string | null;
  now?: Date;
}

export interface ShortNoticeResult {
  isShortNotice: boolean;
  daysUntilRig: number | null;
  effectiveDate: string | null;
}

export function evaluateShortNotice(input: ShortNoticeInput): ShortNoticeResult {
  const now = input.now ?? new Date();
  const reference = input.rigdaydate ?? input.eventdate ?? null;
  if (!reference) return { isShortNotice: false, daysUntilRig: null, effectiveDate: null };
  const target = parseDateOnly(reference);
  if (!target) return { isShortNotice: false, daysUntilRig: null, effectiveDate: reference };
  const today = startOfDayUtc(now);
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return { isShortNotice: days <= SHORT_NOTICE_DAYS, daysUntilRig: days, effectiveDate: reference };
}

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatDaysUntil(days: number | null): string {
  if (days === null) return 'okänt datum';
  if (days === 0) return 'idag';
  if (days === 1) return 'imorgon';
  if (days < 0) return `för ${Math.abs(days)} dagar sedan`;
  return `om ${days} dagar`;
}
