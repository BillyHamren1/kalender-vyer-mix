// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evaluateShortNotice as server } from '../../supabase/functions/_shared/shortNoticeBooking';
import { evaluateShortNotice as client } from '../lib/notifications/shortNoticeBooking';
import { notificationPartner, isSystemNotificationPartner, shortNoticeDedupeFilter } from '../../supabase/functions/_shared/systemConversation';
import * as systemContract from '../../supabase/functions/_shared/systemConversation';
import * as messageContract from '../../supabase/functions/_shared/internal-messages';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

describe('Kortvarselregler', () => {
  const now = new Date('2026-10-17T12:10:00Z');
  for (const evaluate of [server, client]) {
    it('accepterar CONFIRMED idag och om sju dagar men inte igår eller dag åtta', () => {
      for (const [date, expected] of [['2026-10-16', false], ['2026-10-17', true], ['2026-10-24', true], ['2026-10-25', false]] as const) {
        expect(evaluate({ status: 'CONFIRMED', rigdaydate: date, now }).isShortNotice).toBe(expected);
      }
    });
    it.each(['OFFER', 'CANCELLED', 'COMPLETED', 'DRAFT', '', null, undefined])('nekar status %s', status => {
      expect(evaluate({ status, rigdaydate: '2026-10-17', now }).isShortNotice).toBe(false);
    });
  }
});
describe('Production system-thread handler scope', () => {
  const source = readFileSync('supabase/functions/mobile-app-api/index.ts', 'utf8');
  function handler(name: string) {
    const start = source.indexOf(`async function ${name}(`);
    const end = source.indexOf('\nasync function ', start + 1);
    const js = transpileModule(source.slice(start, end), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const deps = { ...systemContract, ...messageContract, corsHeaders: {}, resolveDMPartner: async () => ['system-short-notice'] };
    return new Function(...Object.keys(deps), js + `\nreturn ${name}`)(...Object.values(deps));
  }
  it('reads legacy and new senders only inside caller organization and recipient identities', async () => {
    const filters: Record<string, unknown> = {};
    const query = {
      select() { return query; }, eq(k: string, v: unknown) { filters[k] = v; return query; },
      in(k: string, v: unknown) { filters[k] = v; return query; },
      or(v: string) { filters.or = v; return query; }, not() { return query; }, order() { return query; },
      limit(v: number) { filters.limit = v; return query; },
      then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    const response = await handler('handleGetDMThread')({ from: () => query }, 'staff-a', { partner_id: 'short-notice:booking-a', limit: 30 }, 'org-a', 'user-a');
    const body = await response.json(); expect(body.error ?? response.status).toBe(200);
    expect(filters.organization_id).toBe('org-a');
    expect(filters.recipient_id).toEqual(['staff-a', 'user-a']);
    expect(filters.or).toContain('sender_type.eq.system');
    expect(filters.limit).toBe(31);
  });
  it('rejects replies to Systemet without database writes', async () => {
    let calls = 0;
    const response = await handler('handleSendDirectMessage')({ from: () => { calls++; throw new Error('Unexpected DB call'); } }, 'staff-a', { recipient_id: 'system-short-notice', content: 'reply' }, 'org-a', null);
    expect(response.status).toBe(403);
    expect(calls).toBe(0);
  });
});
describe('Systemets samlade historik', () => {
  it('samlar olika bokningsavsändare men inte mänskliga avsändare', () => {
    expect(notificationPartner({ sender_id: 'short-notice:booking-a', sender_type: 'system' }, 'old-a')).toBe('system-short-notice');
    expect(notificationPartner({ sender_id: 'short-notice:booking-b', sender_type: 'system' }, 'old-b')).toBe('system-short-notice');
    expect(notificationPartner({ sender_id: 'short-notice:booking-a', sender_type: 'staff' }, 'staff-a')).toBe('staff-a');
  });
  it('behåller bokningsspecifik deduplicering trots stabil tråd', () => {
    expect(shortNoticeDedupeFilter('booking-a')).toContain('booking_id.eq.booking-a');
    expect(shortNoticeDedupeFilter('booking-a')).not.toBe(shortNoticeDedupeFilter('booking-b'));
    expect(() => shortNoticeDedupeFilter('bad,filter')).toThrow('invalid_booking_id');
    expect(isSystemNotificationPartner('system-short-notice')).toBe(true);
  });
});