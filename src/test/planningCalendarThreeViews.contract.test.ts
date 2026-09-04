import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Planning bemanningskalender has exactly three primary views', () => {
  const page = read('src/pages/CustomCalendarPage.tsx');

  it('keeps the existing view and adds month and personnel views', () => {
    expect(page).toContain("{ key: 'weekly', label: 'Team' }");
    expect(page).toContain("{ key: 'monthly', label: 'Månad' }");
    expect(page).toContain("{ key: 'personnel', label: 'Personal' }");
    expect(page).toMatch(/viewOptions=\{\[[\s\S]*?\]\}/);
  });

  it('renders a real month grid and a personnel gantt', () => {
    expect(page).toContain('<SimpleMonthlyCalendar');
    expect(page).toContain('<PersonnelGanttView');
  });

  it('uses the existing staff write path from the personnel view', () => {
    expect(page).toMatch(/onAssignStaff=.*staffOps\.handleStaffDrop/);
    expect(page).not.toMatch(/from\(['"]booking_staff_assignments['"]\)/);
  });
});
