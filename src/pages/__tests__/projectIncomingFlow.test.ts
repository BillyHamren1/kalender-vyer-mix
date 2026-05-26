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

  it('IncomingBookingsList merges unplanned projects into the same container', () => {
    const src = read('src/components/project/IncomingBookingsList.tsx');
    expect(src).toContain('useUnplannedProjects');
    expect(src).toContain('ProjectPlanningSheet');
    expect(src).toContain('Att planera');
    expect(src).toContain('bookings.length + unplannedProjects.length');
  });
});
