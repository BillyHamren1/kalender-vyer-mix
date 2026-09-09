import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/WarehouseCalendarPage.tsx', 'utf8');
const personnel = readFileSync('src/components/warehouse/WarehousePersonnelView.tsx', 'utf8');
const hook = readFileSync('src/hooks/useWarehousePersonnelWeek.ts', 'utf8');

describe('lagerpersonalens dagsvy', () => {
  it('erbjuder dag sida vid sida och veckoöversikt', () => {
    expect(page).toContain("{ key: 'day' as const, label: 'Dag sida vid sida' }");
    expect(page).toContain("{ key: 'weekly' as const, label: 'Veckoöversikt' }");
    expect(page).toContain('personnelViewMode');
    expect(page).toContain('personnelView');
  });

  it('ritar varje person som egen kolumn mot samma tidsaxel', () => {
    expect(personnel).toContain('TIMELINE_HEIGHT');
    expect(personnel).toContain('repeat(${visibleRows.length}, 220px)');
    expect(personnel).toContain('<DayColumn key={row.staffId ?? row.staffName}');
    expect(personnel).toContain('Obemannat');
    expect(personnel).toContain('<DayColumn jobs={unstaffed}');
  });

  it('läser exakt-jobb från warehouse_assignments och uppdaterar andra planerares ändringar', () => {
    expect(hook).toContain("from('warehouse_assignments')");
    expect(hook).toContain('useRealtimeInvalidation({');
    expect(hook).toContain("{ table: 'warehouse_assignments', events: ['*'] }");
    expect(hook).toContain("{ table: 'warehouse_calendar_events', events: ['*'] }");
    expect(hook).toContain('refetchInterval: 10_000');
    expect(hook).toContain('refetchIntervalInBackground: false');
    expect(hook).not.toContain("from('staff_assignments')");
  });
});
