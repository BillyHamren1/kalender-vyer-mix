/** One private notification conversation per recipient; historical rows stay intact. */
export const SYSTEM_NOTIFICATION_PARTNER = 'system-short-notice';
const LEGACY_PARTNER = /^short-notice:[A-Za-z0-9_-]{1,128}$/;

export function isSystemNotificationPartner(id: unknown): id is string {
  return typeof id === 'string' && (id === SYSTEM_NOTIFICATION_PARTNER || LEGACY_PARTNER.test(id));
}

export function isSystemNotificationMessage(message: { sender_id?: string; sender_type?: string }): boolean {
  return message.sender_type === 'system' && isSystemNotificationPartner(message.sender_id);
}

export function notificationPartner(message: { sender_id: string; sender_type?: string }, otherwise: string): string {
  return isSystemNotificationMessage(message) ? SYSTEM_NOTIFICATION_PARTNER : otherwise;
}

/** Caller/tenant predicates must be applied by the handler before this filter. */
export function systemNotificationFilter(): string {
  return `and(sender_type.eq.system,sender_id.eq.${SYSTEM_NOTIFICATION_PARTNER}),and(sender_type.eq.system,sender_id.like.short-notice:*)`;
}

export function shortNoticeDedupeFilter(bookingId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) throw new Error('invalid_booking_id');
  return `sender_id.eq.short-notice:${bookingId},and(sender_id.eq.${SYSTEM_NOTIFICATION_PARTNER},booking_id.eq.${bookingId},sender_type.eq.system)`;
}