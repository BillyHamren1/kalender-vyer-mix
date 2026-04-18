import { describe, it, expect } from 'vitest';

/**
 * chatFlow.test.ts — kvarvarande pure UI-helper test.
 *
 * Hela messaging-produkten testas nu i en sammanhållen produktnivå-svit:
 *   src/test/messagingProduct.contract.test.ts
 *
 * Den sviten täcker:
 *   - DM (skicka/markera/arkivera/unread)
 *   - Job chat (hämta/skicka/mark-read/auth-guard/unread)
 *   - Broadcasts (skicka/list/markera, total-badge)
 *   - Inbox-aggregator + total unread (med defensiva fall)
 *   - Attachments (upload-kontrakt + UI guard)
 *   - Contacts + dual-identity flöden
 *
 * Kompletterande SDK-/wrapper-tester:
 *   - src/services/__tests__/mobileApiService.chat.test.ts
 *   - src/services/__tests__/directMessageService.test.ts
 *   - src/services/__tests__/jobChatService.test.ts
 *   - supabase/functions/mobile-app-api/messaging.test.ts (auth/access)
 *
 * Den enda hjälparen som inte har en naturlig hemvist i ovanstående
 * sviter är avatar-initialhämtning, så den lever vidare här.
 */

function getInitials(name: string): string {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

describe('Avatar initials extraction', () => {
  it('extracts first letters of first and last name', () => {
    expect(getInitials('Erik Svensson')).toBe('ES');
  });
  it('handles single name', () => {
    expect(getInitials('Admin')).toBe('A');
  });
  it('truncates to 2 characters for long names', () => {
    expect(getInitials('Anna Lisa Maria')).toBe('AL');
  });
  it('handles empty input', () => {
    expect(getInitials('')).toBe('');
  });
});
