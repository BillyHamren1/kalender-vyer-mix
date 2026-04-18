import { describe, it, expect } from 'vitest';

/**
 * chatFlow.test.ts — UI-side contract tests for messaging.
 *
 * After centralization, all messaging logic (dual-identity merge, mark-as-read,
 * unread aggregation, attachment policy, archiving, access control, contacts
 * dedup) lives in the `mobile-app-api` Edge Function. The frontend only:
 *   1. Consumes backend-shaped payloads (via `mobileApi.*`)
 *   2. Aggregates unread badges across DM + broadcasts + job chat
 *   3. Renders message previews with attachment fallback
 *
 * Backend behavior is covered by:
 *   - supabase/functions/mobile-app-api/messaging.test.ts
 *   - src/services/__tests__/mobileApiService.chat.test.ts
 *
 * This file locks down the small set of pure UI helpers that survive on the
 * client. Anything else has been deleted as legacy.
 */

// ═══════════════════════════════════════════════════════════════
// 1. TOTAL UNREAD BADGE — DM + broadcasts + job chat
// ═══════════════════════════════════════════════════════════════
//
// Mirrors the aggregation done in useUnreadMessageCount / FloatingInbox.
// Source of truth: `mobileApi.getInboxAll()` returns `conversations`,
// `broadcasts`, and `bookings` — each already org-scoped and access-checked
// by the backend. The UI just sums.

interface InboxConversation { partner_id: string; unread_count: number }
interface InboxBroadcast { id: string; is_read: boolean }
interface InboxBooking { id: string; unread_count: number }

function totalUnread(
  conversations: InboxConversation[],
  broadcasts: InboxBroadcast[],
  bookings: InboxBooking[],
): number {
  const dm = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const br = broadcasts.filter((b) => !b.is_read).length;
  const job = bookings.reduce((s, b) => s + (b.unread_count || 0), 0);
  return dm + br + job;
}

describe('Total unread badge aggregation', () => {
  it('sums DM, broadcast, and job-chat unread counts', () => {
    const total = totalUnread(
      [{ partner_id: 'a', unread_count: 3 }, { partner_id: 'b', unread_count: 1 }],
      [{ id: 'b1', is_read: false }, { id: 'b2', is_read: true }],
      [{ id: 'j1', unread_count: 2 }],
    );
    expect(total).toBe(7); // 4 DM + 1 broadcast + 2 job
  });

  it('returns 0 when all sources are empty/read', () => {
    expect(totalUnread([], [], [])).toBe(0);
    expect(
      totalUnread(
        [{ partner_id: 'a', unread_count: 0 }],
        [{ id: 'b1', is_read: true }],
        [{ id: 'j1', unread_count: 0 }],
      ),
    ).toBe(0);
  });

  it('tolerates missing unread_count fields defensively', () => {
    const total = totalUnread(
      [{ partner_id: 'a' } as any, { partner_id: 'b', unread_count: 2 }],
      [],
      [{ id: 'j1' } as any],
    );
    expect(total).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. MESSAGE PREVIEW FALLBACK — attachment without text
// ═══════════════════════════════════════════════════════════════
//
// Used in DM/job-chat inbox rows when last message has only a file.
// Contract: text wins, otherwise show 📎 + filename, otherwise generic label.

function previewFor(msg: {
  content?: string | null;
  file_name?: string | null;
  file_url?: string | null;
}): string {
  const text = (msg.content ?? '').trim();
  if (text) return text;
  if (msg.file_name) return `📎 ${msg.file_name}`;
  if (msg.file_url) return '📎 Bilaga';
  return '';
}

describe('Message preview fallback for attachments', () => {
  it('uses text content when present', () => {
    expect(previewFor({ content: 'Hej!', file_name: 'photo.jpg' })).toBe('Hej!');
  });

  it('falls back to file name when content is empty', () => {
    expect(previewFor({ content: '', file_name: 'photo.jpg' })).toBe('📎 photo.jpg');
    expect(previewFor({ content: '   ', file_name: 'report.pdf' })).toBe('📎 report.pdf');
    expect(previewFor({ content: null, file_name: 'a.png' })).toBe('📎 a.png');
  });

  it('falls back to generic attachment label when only url is known', () => {
    expect(previewFor({ file_url: 'https://x/y.bin' })).toBe('📎 Bilaga');
  });

  it('returns empty string for fully empty messages', () => {
    expect(previewFor({})).toBe('');
    expect(previewFor({ content: '\n\t' })).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. SEND VALIDATION — UI guard before invoking backend
// ═══════════════════════════════════════════════════════════════
//
// The send button is disabled unless either text OR an attachment exists.
// Backend re-validates, but the UI guard prevents pointless network calls.

function canSend(input: { content?: string; attachmentUrl?: string | null }): boolean {
  const hasText = (input.content ?? '').trim().length > 0;
  const hasAttachment = !!input.attachmentUrl;
  return hasText || hasAttachment;
}

describe('Send-message UI guard', () => {
  it('allows sending text-only messages', () => {
    expect(canSend({ content: 'Hej' })).toBe(true);
  });
  it('allows sending attachment-only messages', () => {
    expect(canSend({ content: '', attachmentUrl: 'https://x/y.jpg' })).toBe(true);
  });
  it('blocks empty/whitespace-only with no attachment', () => {
    expect(canSend({ content: '' })).toBe(false);
    expect(canSend({ content: '   \n\t' })).toBe(false);
    expect(canSend({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. AVATAR INITIALS — pure render helper
// ═══════════════════════════════════════════════════════════════

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
