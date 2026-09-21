import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Planning-produktprojektion får aldrig bli tom', () => {
  it('importen läser alltid Booking-källans produktrader', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    expect(src).toMatch(/const WMS_CANONICAL_PRODUCT_CUTOVER = false;/);
  });

  it('importen bär med packbarhet som metadata, aldrig som filter', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    expect(src).toContain('product_packable_default: packableDefault');
    expect(src).toContain('is_packable: effective');
    expect(src).not.toMatch(/products\.filter\([^)]*is_packable/);
  });

  it('WMS-fel blockerar inte lagerprojektionen utan faller tillbaka additivt', () => {
    const src = read('supabase/functions/sync-booking-to-packing/index.ts');
    expect(src).toContain('ensureMissingPackingRowsFromBookingProducts');
    expect(src).not.toContain('throw new Error(\n      `wms_project_projection_failed');
  });

  it('fail-safe tar aldrig bort rader och uppdaterar bara packbarhetsmetadata', () => {
    const src = read('supabase/functions/_shared/packingFailSafe.ts');
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).toContain('.update(update.values)');
    expect(src).toContain('warehouse_packability_override');
    expect(src).toContain("packability_source: source");
    expect(src).toContain('quantity_packed: 0');
  });
});
