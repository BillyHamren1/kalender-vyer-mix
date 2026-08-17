import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('warehouse UI separation contract', () => {
  it('keeps incoming planning and staffing summary outside the personnel calendar chrome', () => {
    const calendar = read('src/pages/WarehouseCalendarPage.tsx');

    expect(calendar).not.toContain('WarehousePlanningInboxBar');
    expect(calendar).not.toContain('WarehouseStaffingOverview');
    expect(calendar).not.toContain('crewByDayTeam');
    expect(calendar).not.toContain('useLagerCrewByDayTeam');
  });

  it('puts incoming Planning projects in the packing action center', () => {
    const actionCenter = read('src/components/packing/PackingActionCenter.tsx');

    expect(actionCenter).toContain("type CategoryKey = 'new' | 'changed' | 'urgent' | 'overdue'");
    expect(actionCenter).toContain("queryKey: ['warehouse-project-inbox']");
    expect(actionCenter).toContain("queryFn: () => fetchInbox('new')");
    expect(actionCenter).toContain('<ConvertInboxDialog');
    expect(actionCenter).toContain('Planera');
  });

  it('does not infer event-specific staffing from a warehouse team/day assignment', () => {
    const cardMeta = read('src/hooks/useWarehouseCardMeta.ts');
    const customEvent = read('src/components/Calendar/CustomEvent.tsx');

    expect(cardMeta).not.toContain("from('staff_assignments')");
    expect(customEvent).not.toContain('Obemannad');
  });

  it('counts each next-7-day job on its exact anchor date only', () => {
    const next7 = read('src/components/warehouse-ops/WarehouseOverviewNext7Days.tsx');

    expect(next7).toContain("j.anchorDate?.slice(0, 10) === dayKey");
    expect(next7).not.toContain('isWithinInterval');
  });

  it('keeps personnel planning on the calendar route and incoming work on packing', () => {
    const dashboard = read('src/pages/WarehouseDashboard.tsx');

    expect(dashboard).toContain('title: "Planera personal"');
    expect(dashboard).toContain('route: "/warehouse/calendar"');
    expect(dashboard).toContain('title: "Hantera inkommande"');
    expect(dashboard).toContain('route: "/warehouse/packing#actions"');
  });
});
