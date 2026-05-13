import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard: "Medel"-knappen på en inkommande bokning får ALDRIG
 * öppna CreateTodoWizard. Den måste öppna CreateProjectWizard.
 *
 * Bug observed 2026-05-13: handleCreateProject i båda sidorna monterade
 * <CreateTodoWizard /> trots att flödet skulle skapa ett medelstort projekt.
 */

const read = (rel: string) =>
  readFileSync(resolve(__dirname, '../../../', rel), 'utf8');

describe('Create-project wireup from incoming bookings', () => {
  it('PlanningDashboard mounts CreateProjectWizard for handleCreateProject', () => {
    const src = read('src/pages/PlanningDashboard.tsx');
    expect(src).toContain('import CreateProjectWizard');
    expect(src).toContain('<CreateProjectWizard');
    // Medel-flödet får inte öppna to do-wizarden
    expect(src).not.toMatch(/<CreateTodoWizard/);
  });

  it('ProjectManagement uses CreateProjectWizard for Medel and CreateTodoWizard only for the header to-do button', () => {
    const src = read('src/pages/ProjectManagement.tsx');
    expect(src).toContain('<CreateProjectWizard');
    expect(src).toContain('<CreateTodoWizard');
    // handleCreateProject ska binda till project-state, inte to do-state
    expect(src).toMatch(/handleCreateProject\s*=\s*\(bookingId[^)]*\)\s*=>\s*{[^}]*setIsCreateProjectOpen\(true\)/s);
    expect(src).toMatch(/handleCreateProject\s*=\s*\(bookingId[^)]*\)\s*=>\s*{[^}]*setCreateProjectBookingId\(bookingId\)/s);
  });
});
