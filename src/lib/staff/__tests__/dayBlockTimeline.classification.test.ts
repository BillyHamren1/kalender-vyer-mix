// @vitest-environment node
/**
 * Steg 3 — actualVisits klassificeras direkt till
 * ProjectBlock / LocationBlock / UnknownPresence.
 * Korta okända vistelser (<15 min) hör hemma i raw/debug, inte i huvudjournalen.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock } from '../dayBlockTimeline';
import type { ActualVisit } from '../actualStaffDayModel';

const visit = (over: Partial<ActualVisit> & Pick<ActualVisit, 'key' | 'knownSiteId' | 'start' | 'end' | 'durationMin'>): ActualVisit => ({
  label: over.key, centre: null, pingCount: 5, avgAccuracy: 10, ...over,
}) as ActualVisit;

describe('buildDayBlockTimeline — visit classification', () => {
  const actualVisits: ActualVisit[] = [
    visit({ key: 'booking:WM', knownSiteId: 'booking:2604-111', label: 'Workman',
            start: '2026-04-29T08:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 240 }),
    visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
            start: '2026-04-29T13:00:00Z', end: '2026-04-29T14:00:00Z', durationMin: 60 }),
    visit({ key: 'large:LP', knownSiteId: 'large:LP-9', label: 'Stort projekt',
            start: '2026-04-29T15:00:00Z', end: '2026-04-29T16:00:00Z', durationMin: 60 }),
    // Okänd lång → UnknownPresence (review)
    visit({ key: 'unk-long', knownSiteId: null, label: 'Okänd plats',
            start: '2026-04-29T17:00:00Z', end: '2026-04-29T17:30:00Z', durationMin: 30 }),
    // Okänd kort → SKIP (raw_only)
    visit({ key: 'unk-short', knownSiteId: null, label: 'Snabbstopp',
            start: '2026-04-29T18:00:00Z', end: '2026-04-29T18:05:00Z', durationMin: 5 }),
  ];

  const blocks = buildDayBlockTimeline({
    allEvents: [], actualVisits, visitByKey: new Map(),
  }).filter(b => b.kind === 'presence') as PresenceBlock[];

  it('skapar fyra presence-block (kort okänd skippas)', () => {
    expect(blocks).toHaveLength(4);
  });

  it('booking:* och large:* blir ProjectBlock', () => {
    expect(blocks[0].presenceKind).toBe('project');
    expect(blocks[0].isProject).toBe(true);
    expect(blocks[2].presenceKind).toBe('project');
    expect(blocks[2].isProject).toBe(true);
  });

  it('site:* / location:* / warehouse:* blir LocationBlock', () => {
    expect(blocks[1].presenceKind).toBe('location');
    expect(blocks[1].isProject).toBe(false);
  });

  it('okänd plats med duration ≥ 15 min blir UnknownPresence (review)', () => {
    expect(blocks[3].presenceKind).toBe('unknown');
    expect(blocks[3].requiresReview).toBe(true);
    expect(blocks[3].subtitle).toMatch(/Okänd plats/);
  });

  it('PresenceBlock bär start/end/duration/placeKey/title/source från visit', () => {
    const b = blocks[0];
    expect(b.startIso).toBe('2026-04-29T08:00:00Z');
    expect(b.endIso).toBe('2026-04-29T12:00:00Z');
    expect(b.durationMin).toBe(240);
    expect(b.placeKey).toBe('booking:WM');
    expect(b.title).toBe('Workman');
    expect(b.sources.gpsVisit).toBe(true);
  });
});
