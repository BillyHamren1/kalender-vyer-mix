import { describe, it, expect } from 'vitest';

/**
 * Kontrakt: Huvudraden i ActualDayPanel får aldrig rendera den råa
 * lower-case strängen "okänd plats" när koordinater finns. Tillåtna fallbacks
 * är "Slår upp adress…" (lookup pending) eller
 * "Okänd plats – adress kunde inte hämtas" (lookup misslyckades).
 *
 * Detta test scannar ActualDayPanel-källkoden efter förbjudna fallback-mönster
 * i label-byggen för gps_travel/gps_visit/gps_arrival/gps_departure.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const FILE = join(process.cwd(), 'src/components/staff/ActualDayPanel.tsx');

describe('unknown place label contract', () => {
  const src = readFileSync(FILE, 'utf-8');

  it('innehåller inga `?? "okänd plats"`-fallbacks i label-byggen', () => {
    // Acceptera kommentarer (// Substituera "okänd plats" …) men inte
    // levande fallback-uttryck.
    const offending = src
      .split('\n')
      .map((line, i) => ({ line, i: i + 1 }))
      .filter(({ line }) => /\?\?\s*['"]okänd plats['"]/.test(line));
    expect(offending, JSON.stringify(offending, null, 2)).toEqual([]);
  });

  it('exponerar lookup-statusarna "Slår upp adress…" och "Okänd plats – adress kunde inte hämtas"', () => {
    expect(src).toContain('Slår upp adress…');
    expect(src).toContain('Okänd plats – adress kunde inte hämtas');
  });
});
