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

    expect(next7).toContain('job.anchorDate >= firstDay && job.anchorDate <= lastDay');
    expect(next7).not.toContain('isWithinInterval');
  });


  it('keeps personnel planning on the calendar route, reachable from Lager OPS', () => {
    const ops = read('src/pages/WarehouseOps.tsx');

    expect(ops).toContain('navigate("/warehouse/calendar")');
    expect(ops).toContain('Bemanning');
    // no airy "Gå vidare" action tiles on the ops surface
    expect(ops).not.toContain('route: "/warehouse/packing#actions"');
  });
});
