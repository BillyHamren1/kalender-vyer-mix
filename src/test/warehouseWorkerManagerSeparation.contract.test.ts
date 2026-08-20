import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('warehouse manager / worker role separation', () => {
  it('keeps the warehouse calendar as the manager planning surface', () => {
    const calendar = read('src/pages/WarehouseCalendarPage.tsx');
    expect(calendar).toContain('Lagerplanering');
    expect(calendar).toContain('Planera alla lagerjobb och bemanna dem här.');
    expect(calendar).toContain('Arbetarna ser sin planering i Mitt lager.');
  });

  it('keeps the mobile lager page worker-facing with one primary action per task', () => {
    const mobile = read('src/pages/mobile/MobileLagerPage.tsx');
    expect(mobile).toContain('Mitt lager');
    expect(mobile).toContain('Här ser du det lagerarbete som är planerat för dig.');
    expect(mobile).toContain("renderSection('Nu'");
    expect(mobile).toContain("renderSection(today ? 'Senare idag' : 'Planerat'");
    expect(mobile).toContain("renderSection('Klart'");
    expect(mobile).not.toContain('Starta scanner');
    expect(mobile).not.toContain('Starta returscanning');
  });

  it('uses one worker-facing active-state rule for section, status and CTA', () => {
    const mobile = read('src/pages/mobile/MobileLagerPage.tsx');
    const labels = read('src/lib/warehouse/lagerLabels.ts');
    expect(mobile).toContain('isAssignmentOperationallyActive(item, now)');
    expect(mobile).toContain('isAssignmentOperationallyActive(item)');
    expect(labels).toContain('isAssignmentCurrentByTime');
    expect(labels).toContain('isAssignmentOperationallyActive');
  });

  it('keeps warehouse team fallback paired to the assignment date', () => {
    const api = read('supabase/functions/mobile-app-api/index.ts');
    expect(api).toContain('lagerTeamsByDate');
    expect(api).toContain('const teamsForDay = lagerTeamsByDate.get(day)');
    expect(api).toContain("!teamsForDay.has(String(w.resource_id || ''))");
  });

  it('has a single worker assignment list and links location detail to Mitt lager', () => {
    const detail = read('src/pages/mobile/MobileLocationDetail.tsx');
    expect(detail).toContain("navigate('/m/lager')");
    expect(detail).not.toContain('LagerMyAssignmentsSection');
  });

});
