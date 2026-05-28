import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../../src/hooks/useUnplannedProjects.ts'), 'utf8');

describe('useUnplannedProjects payload', () => {
  it('includes bookingId so needs_planning rows can reuse BookingPlacementDialog', () => {
    expect(src).toContain('bookingId: string | null;');
    expect(src).toContain("bookingId: r.booking_id ?? null");
  });

  it('filters away stale medium rows when booking is already linked to another project or large project', () => {
    expect(src).toContain('if (b?.large_project_id) return [];');
    expect(src).toContain("if (b?.assigned_project_id && b.assigned_project_id !== r.id) return [];");
  });

  it('does NOT query large_projects — stora projekt hör inte hemma i personalkalenderns "Nya bokningar"-lista', () => {
    expect(src).not.toMatch(/\.from\(['"]large_projects['"]\)/);
    expect(src).not.toContain("kind: 'large'");
  });
});
