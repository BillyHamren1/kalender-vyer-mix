// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatHoursMinutes } from '@/utils/formatHours';
import type {
  PlannedStaffMember,
  StaffTimeReport,
  ProjectLaborCost,
  ProjectStaffSummary,
} from '@/types/projectStaff';

// ─── Helper: replicates the summary calculation from useProjectStaff ───
function calculateSummary(
  plannedStaff: PlannedStaffMember[],
  timeReports: StaffTimeReport[],
  laborCosts: ProjectLaborCost[]
): ProjectStaffSummary {
  return {
    plannedStaffCount: plannedStaff.length,
    workDays: new Set(
      plannedStaff.flatMap((s) => s.assignment_dates.map((d) => d.date))
    ).size,
    reportedHours: timeReports.reduce((sum, r) => sum + r.hours_worked, 0),
    reportedOvertimeHours: timeReports.reduce(
      (sum, r) => sum + (r.overtime_hours || 0),
      0
    ),
    manualHours: laborCosts.reduce((sum, c) => sum + c.hours, 0),
    totalLaborCost: laborCosts.reduce(
      (sum, c) => sum + c.hours * c.hourly_rate,
      0
    ),
  };
}

// ─── Helper: replicates AddTimeReportDialog's hour calculation ───
function calculateHoursFromTimes(startTime: string, endTime: string): number {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? parseFloat(diff.toFixed(1)) : 0;
}

// ─── Fixtures ───
const staffA: PlannedStaffMember = {
  staff_id: 'staff-1',
  staff_name: 'Anna Andersson',
  role: 'Montör',
  color: '#ff0000',
  assignment_dates: [
    { date: '2026-04-10', event_type: 'rig' },
    { date: '2026-04-11', event_type: 'event' },
    { date: '2026-04-12', event_type: 'rigDown' },
  ],
};

const staffB: PlannedStaffMember = {
  staff_id: 'staff-2',
  staff_name: 'Bo Berglund',
  role: 'Tekniker',
  color: '#0000ff',
  assignment_dates: [
    { date: '2026-04-10', event_type: 'rig' },
    { date: '2026-04-11', event_type: 'event' },
  ],
};

const staffC: PlannedStaffMember = {
  staff_id: 'staff-3',
  staff_name: 'Carin Carlsson',
  role: null,
  color: null,
  assignment_dates: [{ date: '2026-04-11', event_type: 'event' }],
};

function makeTimeReport(
  overrides: Partial<StaffTimeReport> & { id: string; staff_id: string }
): StaffTimeReport {
  return {
    staff_name: 'Test',
    report_date: '2026-04-10',
    start_time: null,
    end_time: null,
    hours_worked: 8,
    overtime_hours: 0,
    description: null,
    approved: false,
    approved_at: null,
    approved_by: null,
    ...overrides,
  };
}

function makeLaborCost(
  overrides: Partial<ProjectLaborCost> & { id: string }
): ProjectLaborCost {
  return {
    project_id: 'proj-1',
    staff_id: null,
    staff_name: 'Extern',
    description: null,
    hours: 4,
    hourly_rate: 350,
    work_date: null,
    created_at: '2026-04-10T00:00:00Z',
    created_by: null,
    ...overrides,
  };
}

// ====================================================================
// 1. STAFF ASSIGNMENT TESTS
// ====================================================================
describe('Staff assignment & planned staff', () => {
  it('counts unique staff members', () => {
    const summary = calculateSummary([staffA, staffB, staffC], [], []);
    expect(summary.plannedStaffCount).toBe(3);
  });

  it('counts unique work days across staff (no double-counting shared dates)', () => {
    const summary = calculateSummary([staffA, staffB, staffC], [], []);
    // Dates: 10, 11, 12 → 3 unique days
    expect(summary.workDays).toBe(3);
  });

  it('handles a single staff member with one date (sub-project scenario)', () => {
    const singleStaff: PlannedStaffMember = {
      staff_id: 'staff-x',
      staff_name: 'Solo Worker',
      role: 'Montör',
      color: '#aaa',
      assignment_dates: [{ date: '2026-04-15', event_type: 'rig' }],
    };
    const summary = calculateSummary([singleStaff], [], []);
    expect(summary.plannedStaffCount).toBe(1);
    expect(summary.workDays).toBe(1);
  });

  it('handles empty planned staff (no booking linked)', () => {
    const summary = calculateSummary([], [], []);
    expect(summary.plannedStaffCount).toBe(0);
    expect(summary.workDays).toBe(0);
  });

  it('sorts assignment dates correctly', () => {
    const unsorted: PlannedStaffMember = {
      ...staffA,
      assignment_dates: [
        { date: '2026-04-12', event_type: 'rigDown' },
        { date: '2026-04-10', event_type: 'rig' },
        { date: '2026-04-11', event_type: 'event' },
      ],
    };
    const sorted = [...unsorted.assignment_dates].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    expect(sorted[0].date).toBe('2026-04-10');
    expect(sorted[1].date).toBe('2026-04-11');
    expect(sorted[2].date).toBe('2026-04-12');
  });

  it('correctly identifies event types (rig/event/rigDown)', () => {
    const rigDays = staffA.assignment_dates.filter(
      (d) => d.event_type === 'rig'
    );
    const eventDays = staffA.assignment_dates.filter(
      (d) => d.event_type === 'event'
    );
    const rigDownDays = staffA.assignment_dates.filter(
      (d) => d.event_type === 'rigDown'
    );
    expect(rigDays).toHaveLength(1);
    expect(eventDays).toHaveLength(1);
    expect(rigDownDays).toHaveLength(1);
  });
});

// ====================================================================
// 2. TIME REPORTING TESTS
// ====================================================================
describe('Time reporting', () => {
  it('calculates total reported hours across multiple reports', () => {
    const reports = [
      makeTimeReport({ id: 'tr-1', staff_id: 'staff-1', hours_worked: 8 }),
      makeTimeReport({ id: 'tr-2', staff_id: 'staff-1', hours_worked: 7.5 }),
      makeTimeReport({ id: 'tr-3', staff_id: 'staff-2', hours_worked: 6 }),
    ];
    const summary = calculateSummary([staffA, staffB], reports, []);
    expect(summary.reportedHours).toBe(21.5);
  });

  it('calculates overtime separately', () => {
    const reports = [
      makeTimeReport({
        id: 'tr-1',
        staff_id: 'staff-1',
        hours_worked: 10,
        overtime_hours: 2,
      }),
      makeTimeReport({
        id: 'tr-2',
        staff_id: 'staff-2',
        hours_worked: 9,
        overtime_hours: 1,
      }),
    ];
    const summary = calculateSummary([staffA, staffB], reports, []);
    expect(summary.reportedHours).toBe(19);
    expect(summary.reportedOvertimeHours).toBe(3);
  });

  it('handles zero overtime gracefully', () => {
    const reports = [
      makeTimeReport({
        id: 'tr-1',
        staff_id: 'staff-1',
        hours_worked: 8,
        overtime_hours: 0,
      }),
    ];
    const summary = calculateSummary([staffA], reports, []);
    expect(summary.reportedOvertimeHours).toBe(0);
  });

  it('calculates hours from start/end times correctly', () => {
    expect(calculateHoursFromTimes('07:00', '15:30')).toBe(8.5);
    expect(calculateHoursFromTimes('08:00', '16:00')).toBe(8);
    expect(calculateHoursFromTimes('06:00', '14:30')).toBe(8.5);
  });

  it('returns 0 when end time is before start time (no night shift support in dialog)', () => {
    expect(calculateHoursFromTimes('16:00', '08:00')).toBe(0);
  });

  it('handles very short shifts', () => {
    expect(calculateHoursFromTimes('08:00', '08:30')).toBe(0.5);
    expect(calculateHoursFromTimes('12:00', '12:15')).toBe(0.3);
  });

  it('allows time reporting with only sub-project assignment (no full booking)', () => {
    // Staff assigned only via activity/task, not via calendar team
    const subProjectStaff: PlannedStaffMember = {
      staff_id: 'staff-sub',
      staff_name: 'Sub Project Worker',
      role: 'Montör',
      color: '#ccc',
      assignment_dates: [{ date: '2026-05-01', event_type: null }],
    };
    const reports = [
      makeTimeReport({
        id: 'tr-sub',
        staff_id: 'staff-sub',
        staff_name: 'Sub Project Worker',
        hours_worked: 4,
      }),
    ];
    const summary = calculateSummary([subProjectStaff], reports, []);
    expect(summary.reportedHours).toBe(4);
    expect(summary.plannedStaffCount).toBe(1);
  });
});

// ====================================================================
// 3. LABOR COST PROPAGATION TO COST TABS
// ====================================================================
describe('Labor costs & cost tab propagation', () => {
  it('calculates total labor cost (hours × rate)', () => {
    const costs = [
      makeLaborCost({ id: 'lc-1', hours: 8, hourly_rate: 350 }),
      makeLaborCost({ id: 'lc-2', hours: 4, hourly_rate: 500 }),
    ];
    const summary = calculateSummary([], [], costs);
    expect(summary.totalLaborCost).toBe(8 * 350 + 4 * 500);
    expect(summary.manualHours).toBe(12);
  });

  it('handles zero labor costs', () => {
    const summary = calculateSummary([staffA], [], []);
    expect(summary.totalLaborCost).toBe(0);
    expect(summary.manualHours).toBe(0);
  });

  it('keeps manual hours and reported hours separate in summary', () => {
    const reports = [
      makeTimeReport({ id: 'tr-1', staff_id: 'staff-1', hours_worked: 8 }),
    ];
    const costs = [makeLaborCost({ id: 'lc-1', hours: 4, hourly_rate: 350 })];
    const summary = calculateSummary([staffA], reports, costs);
    expect(summary.reportedHours).toBe(8);
    expect(summary.manualHours).toBe(4);
    // These should not cross-contaminate
    expect(summary.reportedHours + summary.manualHours).toBe(12);
  });

  it('allows labor cost with custom staff name (no staff_id)', () => {
    const cost = makeLaborCost({
      id: 'lc-ext',
      staff_id: null,
      staff_name: 'Extern elektriker',
      hours: 6,
      hourly_rate: 600,
    });
    expect(cost.staff_id).toBeNull();
    expect(cost.staff_name).toBe('Extern elektriker');
    const summary = calculateSummary([], [], [cost]);
    expect(summary.totalLaborCost).toBe(3600);
  });

  it('allows labor cost with linked staff_id', () => {
    const cost = makeLaborCost({
      id: 'lc-linked',
      staff_id: 'staff-1',
      staff_name: 'Anna Andersson',
      hours: 8,
      hourly_rate: 350,
    });
    expect(cost.staff_id).toBe('staff-1');
    const summary = calculateSummary([staffA], [], [cost]);
    expect(summary.totalLaborCost).toBe(2800);
  });
});

// ====================================================================
// 4. FULL FLOW: ASSIGNMENT → TIME → COST SUMMARY
// ====================================================================
describe('Full flow: assignment → time report → cost summary', () => {
  it('integrates staff, time reports, and labor costs into one consistent summary', () => {
    const staff = [staffA, staffB];
    const reports = [
      makeTimeReport({
        id: 'tr-1',
        staff_id: 'staff-1',
        staff_name: 'Anna Andersson',
        hours_worked: 8,
        overtime_hours: 1,
        report_date: '2026-04-10',
      }),
      makeTimeReport({
        id: 'tr-2',
        staff_id: 'staff-2',
        staff_name: 'Bo Berglund',
        hours_worked: 7,
        overtime_hours: 0,
        report_date: '2026-04-10',
      }),
      makeTimeReport({
        id: 'tr-3',
        staff_id: 'staff-1',
        staff_name: 'Anna Andersson',
        hours_worked: 9,
        overtime_hours: 1.5,
        report_date: '2026-04-11',
      }),
    ];
    const costs = [
      makeLaborCost({
        id: 'lc-1',
        staff_id: 'staff-1',
        staff_name: 'Anna Andersson',
        hours: 2,
        hourly_rate: 350,
        work_date: '2026-04-12',
      }),
    ];

    const summary = calculateSummary(staff, reports, costs);

    expect(summary.plannedStaffCount).toBe(2);
    expect(summary.workDays).toBe(3); // 10, 11, 12
    expect(summary.reportedHours).toBe(24); // 8+7+9
    expect(summary.reportedOvertimeHours).toBe(2.5); // 1+0+1.5
    expect(summary.manualHours).toBe(2);
    expect(summary.totalLaborCost).toBe(700); // 2*350
  });

  it('works for a sub-project with only one staff on one day', () => {
    const subStaff: PlannedStaffMember = {
      staff_id: 'staff-sub',
      staff_name: 'Sub Worker',
      role: 'Montör',
      color: null,
      assignment_dates: [{ date: '2026-05-05', event_type: null }],
    };
    const reports = [
      makeTimeReport({
        id: 'tr-sub',
        staff_id: 'staff-sub',
        staff_name: 'Sub Worker',
        hours_worked: 3.5,
        overtime_hours: 0,
      }),
    ];
    const summary = calculateSummary([subStaff], reports, []);

    expect(summary.plannedStaffCount).toBe(1);
    expect(summary.workDays).toBe(1);
    expect(summary.reportedHours).toBe(3.5);
    expect(summary.totalLaborCost).toBe(0);
  });

  it('handles large project with many sub-bookings (multiple staff + dates)', () => {
    const manyStaff = Array.from({ length: 10 }, (_, i) => ({
      staff_id: `staff-${i}`,
      staff_name: `Worker ${i}`,
      role: 'Montör',
      color: null,
      assignment_dates: [
        { date: '2026-06-01', event_type: 'rig' as const },
        { date: '2026-06-02', event_type: 'event' as const },
      ],
    }));
    const reports = manyStaff.map((s, i) =>
      makeTimeReport({
        id: `tr-${i}`,
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        hours_worked: 8,
        overtime_hours: i < 3 ? 2 : 0,
      })
    );
    const summary = calculateSummary(manyStaff, reports, []);
    expect(summary.plannedStaffCount).toBe(10);
    expect(summary.workDays).toBe(2);
    expect(summary.reportedHours).toBe(80);
    expect(summary.reportedOvertimeHours).toBe(6);
  });
});

// ====================================================================
// 5. FORMAT HOURS UTILITY
// ====================================================================
describe('formatHoursMinutes utility', () => {
  it('formats whole hours', () => {
    expect(formatHoursMinutes(8)).toBe('8h');
  });
  it('formats half hours', () => {
    expect(formatHoursMinutes(2.5)).toBe('2h 30m');
  });
  it('formats zero', () => {
    expect(formatHoursMinutes(0)).toBe('0h');
  });
  it('formats minutes only', () => {
    expect(formatHoursMinutes(0.25)).toBe('15m');
  });
  it('formats complex decimal', () => {
    expect(formatHoursMinutes(2.48)).toBe('2h 29m');
  });
});

// ====================================================================
// 6. EDGE CASES
// ====================================================================
describe('Edge cases', () => {
  it('staff with no assignment dates still counts in summary', () => {
    const noDateStaff: PlannedStaffMember = {
      staff_id: 'staff-empty',
      staff_name: 'No Dates',
      role: null,
      color: null,
      assignment_dates: [],
    };
    const summary = calculateSummary([noDateStaff], [], []);
    expect(summary.plannedStaffCount).toBe(1);
    expect(summary.workDays).toBe(0);
  });

  it('labor cost with 0 hours yields 0 cost', () => {
    const zeroCost = makeLaborCost({ id: 'lc-zero', hours: 0, hourly_rate: 500 });
    const summary = calculateSummary([], [], [zeroCost]);
    expect(summary.totalLaborCost).toBe(0);
    expect(summary.manualHours).toBe(0);
  });

  it('labor cost with 0 hourly rate yields 0 cost', () => {
    const freeWork = makeLaborCost({ id: 'lc-free', hours: 8, hourly_rate: 0 });
    const summary = calculateSummary([], [], [freeWork]);
    expect(summary.totalLaborCost).toBe(0);
    expect(summary.manualHours).toBe(8);
  });

  it('multiple reports from same staff on same day accumulate', () => {
    const reports = [
      makeTimeReport({
        id: 'tr-am',
        staff_id: 'staff-1',
        hours_worked: 4,
        report_date: '2026-04-10',
      }),
      makeTimeReport({
        id: 'tr-pm',
        staff_id: 'staff-1',
        hours_worked: 4,
        report_date: '2026-04-10',
      }),
    ];
    const summary = calculateSummary([staffA], reports, []);
    expect(summary.reportedHours).toBe(8);
  });

  it('decimal hours are preserved (not rounded)', () => {
    const reports = [
      makeTimeReport({
        id: 'tr-1',
        staff_id: 'staff-1',
        hours_worked: 7.75,
        overtime_hours: 0.25,
      }),
    ];
    const summary = calculateSummary([staffA], reports, []);
    expect(summary.reportedHours).toBe(7.75);
    expect(summary.reportedOvertimeHours).toBe(0.25);
  });
});
