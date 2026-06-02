import { describe, it, expect } from 'vitest';
import {
  summarizeProjectTravelFromDayReports,
  type StaffDayReportInput,
} from '../projectHoursFromTimeEngine';

const PROJECT = { project_id: 'proj-A' };
const OTHER = { project_id: 'proj-B' };

function workBlock(id: string, start: string, end: string, projectId: string) {
  return { id, kind: 'work', start_at: start, end_at: end, project_id: projectId };
}
function travelBlock(id: string, start: string, end: string, label = 'Resa') {
  return { id, kind: 'travel', start_at: start, end_at: end, label };
}

describe('summarizeProjectTravelFromDayReports', () => {
  it('travel mellan jobb allokeras till destinations-projekt', () => {
    const dayReports: StaffDayReportInput[] = [
      {
        staff_id: 's1',
        date: '2026-06-02',
        blocks: [
          workBlock('w1', '2026-06-02T08:00:00Z', '2026-06-02T10:00:00Z', 'proj-B'),
          travelBlock('t1', '2026-06-02T10:00:00Z', '2026-06-02T10:30:00Z'),
          workBlock('w2', '2026-06-02T10:30:00Z', '2026-06-02T17:00:00Z', 'proj-A'),
        ],
      },
    ];
    const out = summarizeProjectTravelFromDayReports(dayReports, PROJECT);
    expect(out.totalMinutes).toBe(30);
    expect(out.blocks).toHaveLength(1);

    const otherOut = summarizeProjectTravelFromDayReports(dayReports, OTHER);
    expect(otherOut.totalMinutes).toBe(0);
  });

  it('travel före första jobb allokeras till första jobbet', () => {
    const dayReports: StaffDayReportInput[] = [
      {
        staff_id: 's1',
        date: '2026-06-02',
        blocks: [
          travelBlock('t1', '2026-06-02T07:20:00Z', '2026-06-02T08:04:00Z'),
          workBlock('w1', '2026-06-02T08:04:00Z', '2026-06-02T17:00:00Z', 'proj-A'),
        ],
      },
    ];
    const out = summarizeProjectTravelFromDayReports(dayReports, PROJECT);
    expect(out.totalMinutes).toBe(44);
  });

  it('travel efter sista jobb (ej hem) allokeras till sista jobbet', () => {
    const dayReports: StaffDayReportInput[] = [
      {
        staff_id: 's1',
        date: '2026-06-02',
        blocks: [
          workBlock('w1', '2026-06-02T08:00:00Z', '2026-06-02T20:00:00Z', 'proj-A'),
          travelBlock('t1', '2026-06-02T20:00:00Z', '2026-06-02T20:49:00Z', 'Resa till lager'),
        ],
      },
    ];
    const out = summarizeProjectTravelFromDayReports(dayReports, PROJECT);
    expect(out.totalMinutes).toBe(49);
  });

  it('travel hem räknas inte', () => {
    const dayReports: StaffDayReportInput[] = [
      {
        staff_id: 's1',
        date: '2026-06-02',
        blocks: [
          workBlock('w1', '2026-06-02T08:00:00Z', '2026-06-02T17:00:00Z', 'proj-A'),
          travelBlock('t1', '2026-06-02T17:00:00Z', '2026-06-02T17:30:00Z', 'Resa hem'),
        ],
      },
    ];
    const out = summarizeProjectTravelFromDayReports(dayReports, PROJECT);
    expect(out.totalMinutes).toBe(0);
  });
});
