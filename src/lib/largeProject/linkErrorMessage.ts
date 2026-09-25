/**
 * Översätter fel från link_booking_to_large_project / servicelagret till
 * tydliga svenska meddelanden. Ren funktion – testbar utan UI.
 */
export function describeLargeProjectLinkError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = String(e.message ?? '');
  if (e.code === 'BOOKING_IN_OTHER_PROJECT' || /BOOKING_IN_OTHER_PROJECT/i.test(msg)) {
    return msg && !/^.*BOOKING_IN_OTHER_PROJECT:/i.test(msg)
      ? msg
      : 'Bokningen ingår redan i ett annat aktivt stort projekt. Ta bort den därifrån först.';
  }
  if (/PROJECT_NOT_FOUND/i.test(msg)) return 'Projektet finns inte längre eller är raderat. Välj ett annat projekt.';
  if (/BOOKING_NOT_FOUND/i.test(msg)) return 'Bokningen hittades inte eller så saknar du åtkomst till den.';
  if (/ORGANIZATION_MISMATCH/i.test(msg)) return 'Bokningen och projektet tillhör olika organisationer och kan inte kopplas.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Du saknar behörighet att koppla den här bokningen.';
  }
  if (msg === 'BOOKING_ALREADY_ADDED') return 'Bokningen är redan tillagd i detta projekt.';
  return msg || 'Kunde inte koppla bokningen till projektet.';
}
