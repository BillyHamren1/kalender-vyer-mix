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

  it('composes the OPS page as a compact, action-first ops surface', () => {
    const page = read('src/pages/WarehouseOps.tsx');
    expect(page).toContain('Planning OPS');
    expect(page).toContain('<WarehouseBookingQuickOpen');
    expect(page).toContain('<WarehouseOverviewNext7Days');
    expect(page).toContain('<WarehouseOpsActionQueue');
    // Viewport-layout, ingen långscroll-dashboard.
    expect(page).toContain('h-full min-h-0 overflow-hidden');
    // Passiva räknare utan direkt action är borttagna.
    expect(page).not.toContain('obemannade');
    expect(page).not.toContain('saknar tid');
    expect(page).not.toContain('<PackingCalendarView');
  });

  it('keeps the integrated inbox on Planning\'s canonical flow', () => {
    const bar = read('src/components/warehouse/WarehousePlanningInboxBar.tsx');
    expect(bar).toContain("fetchInbox('new')");
    expect(bar).toContain('ConvertInboxDialog');
    expect(bar).toContain('Planera');
    expect(bar).toContain("['warehouse-ops-range']");
  });

  it('work week rows are compact and use plain work labels with inline staffing', () => {
    const week = read('src/components/warehouse-ops/WarehouseOverviewNext7Days.tsx');
    expect(week).toContain("'Retur'");
    expect(week).toContain("'Lager'");
    expect(week).toContain("'Packning'");
    expect(week).not.toMatch(/'UT'|'IN'/);
    expect(week).toContain('Sätt tid');
    expect(week).toContain('+ Bemanna');
    expect(week).toContain('<QuickAssignStaffPopover');
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
