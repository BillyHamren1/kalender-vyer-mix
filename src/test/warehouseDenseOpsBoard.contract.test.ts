import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync('src/pages/WarehouseDashboard.tsx', 'utf8');
const week = readFileSync('src/components/warehouse-ops/WarehouseOverviewNext7Days.tsx', 'utf8');
const inbox = readFileSync('src/components/warehouse/WarehousePlanningInboxBar.tsx', 'utf8');
const search = readFileSync('src/components/warehouse/WarehouseBookingQuickOpen.tsx', 'utf8');

describe('dense warehouse manager OPS board', () => {
  it('keeps inbox, search, attention and work week on the same dashboard', () => {
    expect(dashboard).toContain('WarehousePlanningInboxBar');
    expect(dashboard).toContain('WarehouseBookingQuickOpen compact');
    expect(dashboard).toContain('WarehouseOverviewAttention items={data.attention} maxItems={2} compact');
    expect(dashboard).toContain('WarehouseOverviewNext7Days data={data}');
  });

  it('removes the old card-navigation dashboard pattern', () => {
    expect(dashboard).not.toContain('NEXT_STEPS');
    expect(dashboard).not.toContain('PageHeader');
    expect(dashboard).not.toContain('Gå vidare');
  });

  it('shows in-your-face operational counters in the sticky toolbar', () => {
    expect(dashboard).toContain('obemannade');
    expect(dashboard).toContain('saknar tid');
    expect(dashboard).toContain('uppmärksamhet');
    expect(dashboard).toContain('nya');
  });

  it('renders the week as dense operational rows with explicit work type', () => {
    expect(week).toContain('grid-cols-[82px_84px_100px');
    expect(week).toContain("return 'Packning'");
    expect(week).toContain("return 'Retur'");
    expect(week).toContain("return 'Lager'");
    expect(week).toContain("return { text: '+ Bemanna', muted: true }");
    expect(week).toContain("return formatClock(row.job.anchorTime) || 'Sätt tid'");
    expect(week).not.toContain('Inget lagerarbete planerat.');
  });

  it('keeps canonical incoming warehouse needs directly plan-able in the board', () => {
    expect(inbox).toContain('Nytt / Att planera');
    expect(inbox).toContain('Planera');
    expect(inbox).toContain("invalidateQueries({ queryKey: ['warehouse-ops-range'] })");
  });

  it('uses an overlay search in compact mode so results do not push the board down', () => {
    expect(search).toContain("top-[calc(100%+4px)]");
    expect(search).toContain('absolute left-0 right-0');
  });
});
