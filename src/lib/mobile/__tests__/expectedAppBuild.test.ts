import { describe, it, expect } from 'vitest';
import { classifyAppBuild, CURRENT_EXPECTED_APP_BUILD } from '../expectedAppBuild';

describe('classifyAppBuild', () => {
  it('returns "missing" when no build is reported', () => {
    expect(classifyAppBuild(null)).toBe('missing');
    expect(classifyAppBuild(undefined)).toBe('missing');
    expect(classifyAppBuild('')).toBe('missing');
  });

  it('returns "ok" when reported build matches expected', () => {
    expect(classifyAppBuild(CURRENT_EXPECTED_APP_BUILD)).toBe('ok');
  });

  it('returns "ok" when reported build is greater than expected', () => {
    const future = String(Number.parseInt(CURRENT_EXPECTED_APP_BUILD, 10) + 5);
    expect(classifyAppBuild(future)).toBe('ok');
  });

  it('returns "outdated" when reported build is less than expected', () => {
    const want = Number.parseInt(CURRENT_EXPECTED_APP_BUILD, 10);
    if (want > 0) {
      expect(classifyAppBuild(String(want - 1))).toBe('outdated');
    }
  });

  it('treats non-numeric builds as "ok" (best-effort)', () => {
    expect(classifyAppBuild('abc')).toBe('ok');
  });
});
