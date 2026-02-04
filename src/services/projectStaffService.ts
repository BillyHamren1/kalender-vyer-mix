import { supabase } from '@/integrations/supabase/client';
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

export const fetchTimeReports = async (bookingId: string): Promise<StaffTimeReport[]> => {
  if (!bookingId) return [];

  const { data, error } = await supabase
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
    .eq('booking_id', bookingId)
    .order('report_date', { ascending: true });

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

export const createTimeReport = async (report: {
  booking_id: string;
  staff_id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  description: string | null;
}): Promise<StaffTimeReport> => {
  const { data, error } = await supabase
    .from('time_reports')
    .insert(report)
    .select()
    .single();

  if (error) {
    console.error('Error creating time report:', error);
    throw error;
  }

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', report.staff_id)
    .single();

  return {
    ...data,
    staff_name: staffMember?.name || 'Okänd',
    overtime_hours: data.overtime_hours || 0,
    approved: data.approved || false,
    approved_at: data.approved_at || null,
    approved_by: data.approved_by || null
  };
};

export const deleteTimeReport = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('time_reports')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting time report:', error);
    throw error;
  }
};
