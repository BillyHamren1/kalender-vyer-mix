import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Lager OPS consolidation contract', () => {
  it('routes /warehouse to WarehouseOps and redirects /warehouse/packing', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('const WarehouseOps = lazyWithRecovery(() => import("./pages/WarehouseOps"));');
    expect(app).toContain('<Route path="/warehouse" element={<WarehouseOps />} />');
    expect(app).toContain('<Route path="/warehouse/packing" element={<Navigate to="/warehouse" replace />} />');
    // detail route must survive
    expect(app).toContain('<Route path="/warehouse/packing/:packingId" element={<PackingDetail />} />');
    expect(app).not.toContain('import("./pages/PackingManagement")');
  });

  it('shows Lager OPS in the warehouse menu and drops "Planera packning"', () => {
    const sidebar = read('src/components/WarehouseSidebar3D.tsx');
    expect(sidebar).toContain('{ title: "Lager OPS", url: "/warehouse"');
    expect(sidebar).toContain('{ title: "Lagerplanering", url: "/warehouse/calendar"');
    expect(sidebar).not.toContain('Planera packning');
  });

  it('composes the OPS page from search, action-required, calendar and active work', () => {
    const page = read('src/pages/WarehouseOps.tsx');
    expect(page).toContain('title="Lager OPS"');
    expect(page).toContain('<OpsUnifiedSearch');
    expect(page).toContain('<OpsActionRequired');
    expect(page).toContain('<PackingCalendarView');
    expect(page).toContain('<OpsActiveWork');
  });

  it('unified search covers packing lists and bookings without a packing list', () => {
    const search = read('src/components/warehouse-ops/OpsUnifiedSearch.tsx');
    expect(search).toContain('booking_number.ilike');
    expect(search).toContain('client.ilike');
    expect(search).toContain('deliveryaddress.ilike');
    expect(search).toContain('Saknar packlista');
    expect(search).toContain('packedBookingIds');
    expect(search).toContain('/warehouse/packing/${p.id}');
    expect(search).toContain('/warehouse/bookings/${b.id}');
  });

  it('active work renders nothing when nothing is active', () => {
    const active = read('src/components/warehouse-ops/OpsActiveWork.tsx');
    expect(active).toContain('if (active.length === 0) return null;');
    expect(active).toContain('Fortsätt');
  });

  it('action-required dedupes packings across groups and hides when empty', () => {
    const action = read('src/components/warehouse-ops/OpsActionRequired.tsx');
    expect(action).toContain('changedIds.has');
    expect(action).toContain('overdueIds.has');
    expect(action).toMatch(/return null;/);
  });

  it('keeps the packing calendar a clean workspace with week as default', () => {
    const cal = read('src/components/packing/PackingCalendarView.tsx');
    expect(cal).toContain('useState<ViewMode>("week")');
    expect(cal).not.toContain('Premium Legend');
    expect(cal).not.toContain('UT från lager och IN i retur — i realtid');
  });

  it('leaves warehouse planning calendar route untouched', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('<Route path="/warehouse/calendar" element={<WarehouseCalendarPage />} />');
  });
});
