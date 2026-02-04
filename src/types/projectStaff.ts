export interface ProjectLaborCost {
  id: string;
  project_id: string;
  staff_id: string | null;
  staff_name: string;
  description: string | null;
  hours: number;
  hourly_rate: number;
  work_date: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PlannedStaffMember {
  staff_id: string;
  staff_name: string;
  role: string | null;
  color: string | null;
  assignment_dates: {
    date: string;
    event_type: string | null;
  }[];
}

export interface StaffTimeReport {
  id: string;
  staff_id: string;
  staff_name: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  description: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
}

export interface ProjectStaffSummary {
  plannedStaffCount: number;
  workDays: number;
  reportedHours: number;
  reportedOvertimeHours: number;
  manualHours: number;
  totalLaborCost: number;
}
