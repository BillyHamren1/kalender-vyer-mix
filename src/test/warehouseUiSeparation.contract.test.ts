import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('warehouse OPS contract', () => {
  it('keeps staffing logic outside the OPS workspace', () => {
    const calendar = read('src/pages/WarehouseCalendarPage.tsx');

    expect(calendar).not.toContain('WarehousePlanningInboxBar');
    expect(calendar).not.toContain('WarehouseStaffingOverview');
    expect(calendar).not.toContain('crewByDayTeam');
    expect(calendar).not.toContain('useLagerCrewByDayTeam');
  });

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

  it('does not infer event-specific staffing from a warehouse team/day assignment', () => {
    const cardMeta = read('src/hooks/useWarehouseCardMeta.ts');
    const customEvent = read('src/components/Calendar/CustomEvent.tsx');

    expect(cardMeta).not.toContain("from('staff_assignments')");
    expect(customEvent).not.toContain('Obemannad');
  });
});
