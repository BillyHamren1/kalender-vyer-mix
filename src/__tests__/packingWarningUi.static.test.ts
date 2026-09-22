import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('packlistans diskreta problemindikering', () => {
  it('visar inte den gamla WMS-kontrollen i lagervyerna', () => {
    const checklist = readFileSync('src/components/packing/DesktopChecklistView.tsx', 'utf8');
    const bookingDetail = readFileSync('src/pages/WarehouseBookingDetail.tsx', 'utf8');

    expect(checklist).not.toContain('PackingPreflightPanel');
    expect(bookingDetail).not.toContain('PackingPreflightPanel');
    expect(checklist).not.toContain('WMS-kopplingen är inte verifierad');
  });

  it('återinför inte den stora blockerande feltexten', () => {
    const banner = readFileSync('src/components/packing/PackingIntegrityBanner.tsx', 'utf8');

    expect(banner).not.toContain('Packlistan får inte användas utan kontroll');
    expect(banner).toContain('Visa problem med packlistan');
  });
});