// @vitest-environment node
/**
 * Säkerställer att stale-day-reminder navigerar till /m/day-review
 * MED ?day=<dayKey> så att rätt dag öppnas direkt.
 *
 * Och att MobileDayReview-koden läser parametern via useSearchParams.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const REMINDER = read('src/hooks/useStaleDayReminder.ts');
const PAGE = read('src/pages/mobile/MobileDayReview.tsx');

describe('Stale reminder → exakt dag', () => {
  it('reminder bygger URL med ?day=<dayKey>', () => {
    // Kollar att navigate-anropet inkluderar query-parametern.
    expect(REMINDER).toMatch(/\/m\/day-review\?day=\$\{[^}]*day_key[^}]*\}/);
  });

  it('reminder kodar dayKey via encodeURIComponent', () => {
    expect(REMINDER).toMatch(/encodeURIComponent\(\s*target\.day_key\s*\)/);
  });

  it('MobileDayReview läser ?day via useSearchParams', () => {
    expect(PAGE).toMatch(/useSearchParams/);
    expect(PAGE).toMatch(/searchParams\.get\(['"]day['"]\)/);
  });

  it('MobileDayReview scrollar till matchande day_key', () => {
    expect(PAGE).toMatch(/scrollIntoView/);
    expect(PAGE).toMatch(/dayRefs/);
  });

  it('MobileDayReview kraschar inte vid okänd day-param (tyst fallback)', () => {
    // Implementationen returnerar tidigt om match saknas — ingen throw.
    expect(PAGE).toMatch(/if\s*\(!match\)\s*return/);
  });
});
