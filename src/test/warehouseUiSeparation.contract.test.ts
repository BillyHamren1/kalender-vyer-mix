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
  });

  it('consolidates dashboard and packing planning into Lager OPS', () => {
    const dashboard = read('src/pages/WarehouseDashboard.tsx');
    const legacyPacking = read('src/pages/PackingManagement.tsx');
    const sidebar = read('src/components/WarehouseSidebar3D.tsx');

    expect(dashboard).toContain('title="Lager OPS"');
    expect(dashboard).toContain('<PackingActionCenter packings={packings} />');
    expect(dashboard).toContain('<PackingActiveWork packings={packings} />');
    expect(dashboard).toContain('<PackingCalendarView packings={packings} />');
    expect(dashboard).toContain('Hitta packlista');
    expect(dashboard).not.toContain('WarehouseOverviewNext7Days');
    expect(dashboard).not.toContain('WarehouseOverviewAttention');
    expect(dashboard).not.toContain('NEXT_STEPS');

    expect(legacyPacking).toContain('<Navigate to="/warehouse" replace />');
    expect(sidebar).toContain('{ title: "Lager OPS", url: "/warehouse"');
    expect(sidebar).not.toContain('Planera packning');
    expect(sidebar).not.toContain('Dashboard');
  });

  it('does not infer event-specific staffing from a warehouse team/day assignment', () => {
    const cardMeta = read('src/hooks/useWarehouseCardMeta.ts');
    const customEvent = read('src/components/Calendar/CustomEvent.tsx');

    expect(cardMeta).not.toContain("from('staff_assignments')");
    expect(customEvent).not.toContain('Obemannad');
  });
});
