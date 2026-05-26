import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../../src/hooks/useUnplannedProjects.ts'), 'utf8');

describe('useUnplannedProjects payload', () => {
  it('includes bookingId so needs_planning rows can reuse BookingPlacementDialog', () => {
    expect(src).toContain('bookingId: string | null;');
    expect(src).toContain("bookingId: r.booking_id ?? null");
    expect(src).toContain("bookingId: b?.id ?? null");
  });
});