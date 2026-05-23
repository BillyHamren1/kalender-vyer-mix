import { describe, expect, it } from 'vitest';
import { buildBadgeStackTransform } from '@/components/staff/RawGpsSatelliteMap';

describe('buildBadgeStackTransform', () => {
  it('returns a stable translate transform for stacked badges', () => {
    expect(buildBadgeStackTransform(0)).toBe('translate(-5px, calc(-100% - 0px))');
    expect(buildBadgeStackTransform(26)).toBe('translate(-5px, calc(-100% - 26px))');
  });
});