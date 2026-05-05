/**
 * Kontrakt: planerad starttid 16:00 (lagrad som "naiv" UTC-sträng) MÅSTE
 * renderas som 16:00 i admin/timrapport-vyer — exakt som personalkalendern
 * visar den. Ingen UTC→lokal-konvertering.
 *
 * Bug: tidigare användes `format(new Date(iso), 'HH:mm')` på t.ex.
 * "2026-04-29T16:00:00+00:00" → blev 18:00 i Europe/Stockholm. Korrekt
 * helper är `extractUTCTime` som läser siffrorna naivt.
 */
import { describe, it, expect } from 'vitest';
import { extractUTCTime } from '@/utils/dateUtils';

describe('planned start renders identically to staff calendar', () => {
  const variants = [
    '2026-04-29T16:00:00+00:00',
    '2026-04-29T16:00:00.000Z',
    '2026-04-29 16:00:00+00',
    '2026-04-29T16:00:00+02:00',
  ];

  for (const iso of variants) {
    it(`renders ${iso} as 16:00`, () => {
      expect(extractUTCTime(iso)).toBe('16:00');
    });
  }
});
