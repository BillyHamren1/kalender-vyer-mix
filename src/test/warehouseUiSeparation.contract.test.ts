import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('warehouse OPS contract', () => {
  it('uses a direct action list instead of KPI/category cards', () => {
    const actionCenter = read('src/components/packing/PackingActionCenter.tsx');

    expect(actionCenter).toContain("queryKey: ['warehouse-project-inbox']");
    expect(actionCenter).toContain("queryFn: () => fetchInbox('new')");
    expect(actionCenter).toContain('<ConvertInboxDialog');
    expect(actionCenter).toContain('Planera');
    expect(actionCenter).toContain('Ändringar att granska');
    expect(actionCenter).toContain('Försenat arbete');
    expect(actionCenter).not.toContain('grid-cols-2 md:grid-cols-4');
    expect(actionCenter).not.toContain('CategoryKey');
    expect(actionCenter).not.toContain('Inget kräver åtgärd just nu');
  });

  it('does not duplicate changed packings into the normal upcoming action group', () => {
    const actionCenter = read('src/components/packing/PackingActionCenter.tsx');

    expect(actionCenter).toContain('const changedIds = useMemo');
    expect(actionCenter).toContain('if (changedIds.has(p.id)) return false;');
    expect(actionCenter).toContain("if (p.status !== 'planning') return false;");
  });

  it('hides empty active work instead of rendering informational filler', () => {
    const activeWork = read('src/components/packing/PackingActiveWork.tsx');

    expect(activeWork).toContain('if (active.length === 0) return null;');
    expect(activeWork).toContain('Fortsätt');
    expect(activeWork).not.toContain('Inget pågående packningsarbete just nu');
    expect(activeWork).not.toContain('{active.length}</span>');
  });

  it('keeps the packing calendar as a work surface instead of a nested dashboard card', () => {
    const packingCalendar = read('src/components/packing/PackingCalendarView.tsx');

    expect(packingCalendar).toContain('useState<ViewMode>("week")');
    expect(packingCalendar).toContain('UT · packning');
    expect(packingCalendar).toContain('IN · retur');
    expect(packingCalendar).toContain('openPacking(event.packingId)');
    expect(packingCalendar).not.toContain('Premium Header');
    expect(packingCalendar).not.toContain('Premium Legend');
    expect(packingCalendar).not.toContain('Packningskalender');
    expect(packingCalendar).not.toContain('i realtid');
    expect(packingCalendar).not.toContain('sorted.length}</span>');
  });

  it('consolidates dashboard and packing planning into Lager OPS', () => {
    const dashboard = read('src/pages/WarehouseDashboard.tsx');
    const legacyPacking = read('src/pages/PackingManagement.tsx');
    const sidebar = read('src/components/WarehouseSidebar3D.tsx');

    expect(dashboard).toContain('title="Lager OPS"');
    expect(dashboard).toContain('<WarehouseOpsSearch packings={packings} />');
    expect(dashboard).toContain('<PackingActionCenter packings={packings} />');
    expect(dashboard).toContain('<PackingActiveWork packings={packings} />');
    expect(dashboard).toContain('<PackingCalendarView packings={packings} />');
    expect(dashboard).toContain('Planera packning och retur');
    expect(dashboard).not.toContain('WarehouseOverviewNext7Days');
    expect(dashboard).not.toContain('WarehouseOverviewAttention');
    expect(dashboard).not.toContain('WarehouseBookingQuickOpen');
    expect(dashboard).not.toContain('NEXT_STEPS');

    expect(legacyPacking).toContain('<Navigate to="/warehouse" replace />');
    expect(sidebar).toContain('{ title: "Lager OPS", url: "/warehouse"');
    expect(sidebar).not.toContain('Planera packning');
    expect(sidebar).not.toContain('Dashboard');
  });

  it('uses one unified search for bookings and packlists', () => {
    const search = read('src/components/warehouse/WarehouseOpsSearch.tsx');

    expect(search).toContain('Sök bokning, packlista, kund eller adress');
    expect(search).toContain('Öppna packlista');
    expect(search).toContain('/warehouse/bookings/');
    expect(search).toContain('/warehouse/packing/');
    expect(search).toContain('matchedBookingIds');
  });

  it('replaces visible warehouse team columns with Calendar and Personnel views', () => {
    const calendar = read('src/pages/WarehouseCalendarPage.tsx');
    const general = read('src/components/warehouse/WarehouseGeneralCalendar.tsx');
    const personnel = read('src/components/warehouse/WarehousePersonnelCalendar.tsx');

    expect(calendar).toContain("type CalendarSurface = 'calendar' | 'personnel'");
    expect(calendar).toContain('Kalender');
    expect(calendar).toContain('Personal');
    expect(calendar).toContain('<WarehouseGeneralCalendar');
    expect(calendar).toContain('<WarehousePersonnelCalendar');
    expect(calendar).not.toContain('useWarehouseResources');
    expect(calendar).not.toContain('distributeWarehouseEvents');
    expect(calendar).not.toContain('visibleTeamsByDay');
    expect(calendar).not.toContain('getVisibleTeamsForDay');
    expect(calendar).not.toContain('Lager 1');
    expect(general).toContain('Tilldela personal');
    expect(personnel).toContain('Personal');
  });

  it('keeps legacy warehouse resource ids as compatibility data only', () => {
    const calendar = read('src/pages/WarehouseCalendarPage.tsx');

    expect(calendar).toContain('legacyWarehouseResourceId');
    expect(calendar).toContain("resourceId: event.resource_id || 'warehouse'");
  });

  it('uses canonical warehouse assignments for staff calendar and productivity learning signals', () => {
    const hook = read('src/hooks/useWarehousePersonnelCalendar.ts');

    expect(hook).toContain("from('warehouse_assignments')");
    expect(hook).toContain("from('staff_members')");
    expect(hook).toContain('WarehouseStaffProductivitySignal');
    expect(hook).toContain('actualSampleCount');
    expect(hook).toContain('relativeToTypeMedianPct');
    expect(hook).toContain("confidence: 'none' | 'low' | 'medium' | 'high'");
  });

  it('does not infer event-specific staffing from generic staff team assignments', () => {
    const cardMeta = read('src/hooks/useWarehouseCardMeta.ts');
    const customEvent = read('src/components/Calendar/CustomEvent.tsx');
    const personnelHook = read('src/hooks/useWarehousePersonnelCalendar.ts');

    expect(cardMeta).not.toContain("from('staff_assignments')");
    expect(customEvent).not.toContain('Obemannad');
    expect(personnelHook).not.toContain("from('staff_assignments')");
  });
});
