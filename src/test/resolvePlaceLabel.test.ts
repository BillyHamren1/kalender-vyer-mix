import { describe, it, expect } from 'vitest';
import { resolvePlaceLabel } from '@/lib/staff/resolvePlaceLabel';

describe('resolvePlaceLabel', () => {
  it('1) intern match vinner', () => {
    expect(resolvePlaceLabel({ internalLabel: 'Lager', lat: 1, lng: 2, lookupState: 'ok', resolvedLabel: 'Vägen 1' }))
      .toEqual({ label: 'Lager', source: 'matched' });
  });

  it('2) reverse-geocode resultat används när intern match saknas', () => {
    expect(resolvePlaceLabel({ resolvedLabel: 'Storgatan 5', lookupState: 'ok', lat: 1, lng: 2 }))
      .toEqual({ label: 'Storgatan 5', source: 'lookup' });
  });

  it('3) lat/lng utan svar än → pending', () => {
    expect(resolvePlaceLabel({ lat: 1, lng: 2, lookupState: 'loading' }))
      .toEqual({ label: 'Slår upp adress…', source: 'pending' });
    // idle räknas också som pending så länge koordinater finns
    expect(resolvePlaceLabel({ lat: 1, lng: 2, lookupState: 'idle' }))
      .toEqual({ label: 'Slår upp adress…', source: 'pending' });
  });

  it('4) lookup error → "Okänd plats – adress kunde inte hämtas"', () => {
    expect(resolvePlaceLabel({ lat: 1, lng: 2, lookupState: 'error' }))
      .toEqual({ label: 'Okänd plats – adress kunde inte hämtas', source: 'failed' });
  });

  it('5) inga koordinater och ingen intern match → "saknar koordinat"', () => {
    expect(resolvePlaceLabel({}))
      .toEqual({ label: 'Okänd plats – saknar koordinat', source: 'no_coords' });
  });

  it('returnerar ALDRIG råa "okänd plats" som label', () => {
    const cases = [
      {}, { lat: 1, lng: 2 }, { lat: 1, lng: 2, lookupState: 'error' as const },
      { lat: 1, lng: 2, lookupState: 'loading' as const },
      { internalLabel: '   ', lat: 1, lng: 2 },
    ];
    for (const c of cases) {
      const out = resolvePlaceLabel(c);
      expect(out.label.toLowerCase()).not.toBe('okänd plats');
      expect(out.label).not.toMatch(/^okänd plats$/i);
    }
  });
});
