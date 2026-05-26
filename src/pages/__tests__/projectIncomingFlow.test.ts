import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../../', rel), 'utf8');

describe('ProjectManagement incoming flow', () => {
  it('renders only one incoming container flow in ProjectManagement', () => {
    const src = read('src/pages/ProjectManagement.tsx');
    expect(src).toContain('<IncomingBookingsList');
    expect(src).not.toContain('<UnplannedProjectsBanner');
  });

  it('IncomingBookingsList merges unplanned projects into the same Placera flow', () => {
    const src = read('src/components/project/IncomingBookingsList.tsx');
    expect(src).toContain('useUnplannedProjects');
    expect(src).toContain('setPlacementBookingId(project.bookingId)');
    expect(src).toContain('<span>Placera</span>');
    expect(src).not.toContain('ProjectPlanningSheet');
    expect(src).not.toContain('Att planera');
    expect(src).toContain('bookings.length + unplannedProjects.length');
  });

  it('BookingPlacementDialog removes stale medium project when linking booking into existing large project', () => {
    const src = read('src/components/project/BookingPlacementDialog.tsx');
    expect(src).toContain('assigned_project_id');
    expect(src).toContain('await deleteProject(booking.assigned_project_id)');
  });
});
