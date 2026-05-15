import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { ProjectLaborCost, PlannedStaffMember, StaffTimeReport } from '@/types/projectStaff';

export const fetchPlannedStaff = async (bookingId: string): Promise<PlannedStaffMember[]> => {
  if (!bookingId) return [];

  // Get staff assignments for the booking
  const { data: assignments, error } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id, assignment_date, team_id')
    .eq('booking_id', bookingId);

  if (error) {
    console.error('Error fetching staff assignments:', error);
    throw error;
  }

  if (!assignments || assignments.length === 0) return [];

  // Get unique staff IDs
  const staffIds = [...new Set(assignments.map(a => a.staff_id))];

  // Get staff member details
  const { data: staffMembers, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, role, color')
    .in('id', staffIds);

  if (staffError) {
    console.error('Error fetching staff members:', staffError);
    throw staffError;
  }

  // Get calendar events for this booking to determine event types per date
  const { data: calendarEvents, error: eventsError } = await supabase
    .from('calendar_events')
    .select('start_time, event_type')
    .eq('booking_id', bookingId);

  if (eventsError) {
    console.error('Error fetching calendar events:', eventsError);
  }

  // Build map of date to event_type
  const dateEventTypeMap: Record<string, string> = {};
  calendarEvents?.forEach(event => {
    const date = event.start_time.split('T')[0];
    if (event.event_type) {
      dateEventTypeMap[date] = event.event_type;
    }
  });

  // Group assignments by staff
  const staffMap = new Map<string, PlannedStaffMember>();

  assignments.forEach(assignment => {
    const staffMember = staffMembers?.find(s => s.id === assignment.staff_id);
    if (!staffMember) return;

    if (!staffMap.has(assignment.staff_id)) {
      staffMap.set(assignment.staff_id, {
        staff_id: assignment.staff_id,
        staff_name: staffMember.name,
        role: staffMember.role,
        color: staffMember.color,
        assignment_dates: []
      });
    }

    const entry = staffMap.get(assignment.staff_id)!;
    entry.assignment_dates.push({
      date: assignment.assignment_date,
      event_type: dateEventTypeMap[assignment.assignment_date] || null
    });
  });

  // Sort assignment_dates for each staff member
  staffMap.forEach(staff => {
    staff.assignment_dates.sort((a, b) => a.date.localeCompare(b.date));
  });

  return Array.from(staffMap.values());
};

export const fetchTimeReports = async (target: {
  booking_id?: string | null;
  large_project_id?: string | null;
}): Promise<StaffTimeReport[]> => {
  if (!target.booking_id && !target.large_project_id) return [];

  let query = supabase
    .from('time_reports')
    .select(`
      id,
      staff_id,
      report_date,
      start_time,
      end_time,
      hours_worked,
      overtime_hours,
      description,
      approved,
      approved_at,
      approved_by
    `)
    .eq('is_subdivision', false)
    .order('report_date', { ascending: true });

  query = target.large_project_id
    ? query.eq('large_project_id', target.large_project_id)
    : query.eq('booking_id', target.booking_id!);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching time reports:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Get staff names
  const staffIds = [...new Set(data.map(r => r.staff_id))];
  const { data: staffMembers } = await supabase
    .from('staff_members')
    .select('id, name')
    .in('id', staffIds);

  const staffNameMap = new Map(staffMembers?.map(s => [s.id, s.name]) || []);

  return data.map(report => ({
    ...report,
    staff_name: staffNameMap.get(report.staff_id) || 'Okänd',
    overtime_hours: report.overtime_hours || 0,
    approved: report.approved || false,
    approved_at: report.approved_at || null,
    approved_by: report.approved_by || null
  }));
};

export const fetchLaborCosts = async (projectId: string): Promise<ProjectLaborCost[]> => {
  const { data, error } = await supabase
    .from('project_labor_costs')
    .select('*')
    .eq('project_id', projectId)
    .order('work_date', { ascending: false });

  if (error) {
    console.error('Error fetching labor costs:', error);
    throw error;
  }

  return data || [];
};

export const createLaborCost = async (cost: Omit<ProjectLaborCost, 'id' | 'created_at'>): Promise<ProjectLaborCost> => {
  const { data, error } = await supabase
    .from('project_labor_costs')
    .insert(cost)
    .select()
    .single();

  if (error) {
    console.error('Error creating labor cost:', error);
    throw error;
  }

  return data;
};

export const updateLaborCost = async (id: string, updates: Partial<ProjectLaborCost>): Promise<ProjectLaborCost> => {
  const { data, error } = await supabase
    .from('project_labor_costs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating labor cost:', error);
    throw error;
  }

  return data;
};

export const deleteLaborCost = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_labor_costs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting labor cost:', error);
    throw error;
  }
};

// === Time-report writes go through the mobile-app-api edge function ===
// projectStaffService MUST NOT write directly to time_reports. The edge
// function enforces the same validation as the mobile flow (datetime
// overlap, approved-lock, hours/break/overtime ranges) and is the single
// authoritative write path. DB triggers are the ultimate backstop.

export const createTimeReport = async (report: {
  booking_id?: string;
  large_project_id?: string;
  staff_id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  description: string | null;
}): Promise<StaffTimeReport> => {
  if (!report.start_time || !report.end_time) {
    throw new Error('Start- och sluttid krävs');
  }

  const result = await mobileApi.adminCreateTimeReport({
    target_staff_id: report.staff_id,
    booking_id: report.booking_id,
    large_project_id: report.large_project_id,
    report_date: report.report_date,
    start_time: report.start_time,
    end_time: report.end_time,
    overtime_hours: report.overtime_hours || 0,
    description: report.description || undefined,
  });

  const created = result.time_report;

  // Fetch staff name for the returned StaffTimeReport shape used by the UI.
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', report.staff_id)
    .single();

  return {
    id: created.id,
    staff_id: created.staff_id,
    staff_name: staffMember?.name || 'Okänd',
    report_date: created.report_date,
    start_time: created.start_time,
    end_time: created.end_time,
    hours_worked: created.hours_worked,
    overtime_hours: created.overtime_hours || 0,
    description: created.description,
    approved: created.approved || false,
    approved_at: created.approved_at || null,
    approved_by: created.approved_by || null,
  };
};

export const deleteTimeReport = async (id: string): Promise<void> => {
  await mobileApi.adminDeleteTimeReport(id);
};
