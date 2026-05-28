import { describe, it, expect } from 'vitest';
import { buildDayCloser } from '../lastPingReason';
import type { DaySegment } from '../dayPartition';

function seg(partial: Partial<DaySegment> & { type: DaySegment['type']; start: string; end: string }): DaySegment {
  const startMs = new Date(partial.start).getTime();
  const endMs = new Date(partial.end).getTime();
  return {
    label: partial.label ?? partial.type,
    minutes: Math.max(0, Math.round((endMs - startMs) / 60_000)),
    knownSiteId: null,
    fromLabel: null,
    toLabel: null,
    ...partial,
  } as DaySegment;
}

const FORBIDDEN = /batteri|app stängd|GPS avstängd|troligen|möjligen|stannade kvar|kom hem/i;

describe('buildDayCloser', () => {
  it('rapporterar resa till hem efter sista arbetsblock', () => {
    const work = seg({ type: 'work', label: 'Swedish game fair', start: '2026-05-28T06:24:00Z', end: '2026-05-28T18:26:00Z' });
    const travel = seg({
      type: 'travel',
      label: 'Resa',
      start: '2026-05-28T18:26:00Z',
      end: '2026-05-28T19:06:00Z',
      fromLabel: 'Swedish game fair',
      toLabel: 'Hem',
    });
    const home = seg({ type: 'private', label: 'Hem', start: '2026-05-28T19:06:00Z', end: '2026-05-28T22:00:00Z' });
    const out = buildDayCloser({ reportRows: [work], rawSegments: [work, travel, home], actualLastPingIso: '2026-05-28T22:00:00Z' });
    expect(out).not.toBeNull();
    expect(out!.text).toMatch(/Arbetsdagen avslutades/);
    expect(out!.text).toMatch(/resa från Swedish game fair/);
    expect(out!.text).toMatch(/Hem/);
    expect(out!.text).not.toMatch(FORBIDDEN);
  });

  it('private direkt efter arbete utan travel → "→ Hem"', () => {
    const work = seg({ type: 'work', label: 'Lager', start: '2026-05-28T06:00:00Z', end: '2026-05-28T15:00:00Z', toLabel: 'Lager' });
    const home = seg({ type: 'private', label: 'Hem', start: '2026-05-28T15:00:00Z', end: '2026-05-28T20:00:00Z' });
    const out = buildDayCloser({ reportRows: [work], rawSegments: [work, home], actualLastPingIso: '2026-05-28T20:00:00Z' });
    expect(out!.text).toMatch(/Arbetsdagen avslutades/);
    expect(out!.text).toMatch(/Lager → Hem/);
    expect(out!.text).not.toMatch(FORBIDDEN);
  });

  it('resa utan känt mål → bara fakta, ingen hemmention', () => {
    const work = seg({ type: 'work', label: 'Projekt X', start: '2026-05-28T06:00:00Z', end: '2026-05-28T14:00:00Z', toLabel: 'Projekt X' });
    const travel = seg({ type: 'travel', label: 'Resa', start: '2026-05-28T14:00:00Z', end: '2026-05-28T14:45:00Z', fromLabel: 'Projekt X', toLabel: null });
    const out = buildDayCloser({ reportRows: [work], rawSegments: [work, travel], actualLastPingIso: '2026-05-28T14:45:00Z' });
    expect(out!.text).toMatch(/resa från Projekt X/);
    expect(out!.text).toMatch(/Inga fler arbetsplats-pings/);
    expect(out!.text).not.toMatch(/Hem/);
    expect(out!.text).not.toMatch(FORBIDDEN);
  });

  it('bara dolda unknown/gap efter sista rapport → "Pings fortsatte"', () => {
    const work = seg({ type: 'work', label: 'Site', start: '2026-05-28T06:00:00Z', end: '2026-05-28T14:00:00Z' });
    const unknown = seg({ type: 'unknown_place', label: 'Okänt', start: '2026-05-28T14:00:00Z', end: '2026-05-28T14:30:00Z' });
    const out = buildDayCloser({ reportRows: [work], rawSegments: [work, unknown], actualLastPingIso: '2026-05-28T14:30:00Z' });
    expect(out!.text).toMatch(/Pings fortsatte till/);
    expect(out!.text).toMatch(/okänt/);
    expect(out!.text).not.toMatch(FORBIDDEN);
  });

  it('tomt eller inget efter sista rapport-rad → null', () => {
    const work = seg({ type: 'work', label: 'Site', start: '2026-05-28T06:00:00Z', end: '2026-05-28T14:00:00Z' });
    expect(buildDayCloser({ reportRows: [work], rawSegments: [work], actualLastPingIso: '2026-05-28T14:00:00Z' })).toBeNull();
    expect(buildDayCloser({ reportRows: [], rawSegments: [], actualLastPingIso: null })).toBeNull();
  });
});
