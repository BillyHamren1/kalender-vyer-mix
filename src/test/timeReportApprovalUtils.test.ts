import { describe, expect, it } from 'vitest';
import {
  buildExportRows,
  getApprovalStatus,
  groupReportsByProject,
  groupReportsByStaff,
  type UnifiedApprovalRow,
} from '@/lib/timeReportApprovalUtils';

const baseRow: UnifiedApprovalRow = {
  id: '1',
  organizationId: 'org-1',
  sourceType: 'time_report',
  staffId: 'staff-1',
  staffName: 'Anna',
  projectId: 'booking-1',
  projectLabel: '2601 · Alpha',
  reportDate: '2026-04-20',
  startTime: '08:00',
  endTime: '16:00',
  hoursWorked: 8,
  overtimeHours: 1,
  description: 'Montering',
  approved: false,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionComment: null,
  createdAt: '2026-04-20T16:00:00Z',
  typeLabel: 'Arbete',
};

describe('timeReportApprovalUtils', () => {
  it('treats rejected rows as rejected before approved', () => {
    expect(getApprovalStatus({ approved: true, rejectedAt: '2026-04-20T17:00:00Z' })).toBe('rejected');
  });

  it('groups all salary-bearing time by staff including travel', () => {
    const groups = groupReportsByStaff([
      baseRow,
      {
        ...baseRow,
        id: '2',
        sourceType: 'travel_log',
        typeLabel: 'Resa',
        hoursWorked: 1.5,
        projectId: 'booking-1',
        projectLabel: '2601 · Alpha',
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].totalHours).toBe(9.5);
    expect(groups[0].pendingCount).toBe(2);
  });

  it('groups by project and separates rejected rows', () => {
    const groups = groupReportsByProject([
      baseRow,
      {
        ...baseRow,
        id: '3',
        projectId: 'booking-2',
        projectLabel: '2602 · Beta',
        rejectedAt: '2026-04-20T17:00:00Z',
        rejectedBy: 'Admin',
        rejectionComment: 'Fel projekt',
      },
    ]);

    expect(groups).toHaveLength(2);
    const rejectedGroup = groups.find((group) => group.key === 'booking-2');
    expect(rejectedGroup?.rejectedCount).toBe(1);
  });

  it('builds export rows with rejection metadata', () => {
    const rows = buildExportRows([
      {
        ...baseRow,
        id: '4',
        sourceType: 'travel_log',
        typeLabel: 'Resa',
        rejectedAt: '2026-04-20T17:00:00Z',
        rejectedBy: 'Admin',
        rejectionComment: 'Saknar underlag',
      },
    ]);

    expect(rows[0]).toMatchObject({
      typ: 'Resa',
      status: 'rejected',
      avvisad_av: 'Admin',
      avvisningskommentar: 'Saknar underlag',
    });
  });
});
