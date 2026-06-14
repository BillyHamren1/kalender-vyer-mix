import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('usePackingList linked bookings contract', () => {
  const source = readFileSync(join(process.cwd(), 'src/hooks/usePackingList.tsx'), 'utf8');

  it('hämtar linked bookings för alla packlistor, inte bara large projects', () => {
    expect(source).toMatch(/enabled:\s*!!packingId\b/);
    expect(source).not.toMatch(/enabled:\s*!!packingId\s*&&\s*!!packing\?\.large_project_id/);
  });
});