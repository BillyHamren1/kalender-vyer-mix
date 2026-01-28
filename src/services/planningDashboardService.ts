import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, subDays, addDays, startOfWeek } from "date-fns";

// Staff with location and status
export interface StaffLocation {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  bookingId: string | null;
  bookingClient: string | null;
  deliveryAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  isWorking: boolean;
  lastReportTime: string | null;
}

// Available staff for booking
export interface AvailableStaff {
  id: string;
  name: string;
  color: string | null;
  role: string | null;
  availabilityType: string;
}

// All staff with active status
export interface AllStaffMember {
  id: string;
  name: string;
  color: string | null;
  role: string | null;
  isActive: boolean;
  currentTeam: string | null;
  currentTeamName: string | null;
}

// Day assignment for drop zones (legacy)
export interface DayAssignment {
  date: Date;
  teamId: string;
  teamName: string;
  staff: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}

// Project/booking for week view
export interface WeekProject {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  eventType: string;
  deliveryAddress: string | null;
  date: Date;
  rigDate: string | null;
  eventDate: string | null;
  rigdownDate: string | null;
  assignedStaff: Array<{
    id: string;
    name: string;
    color: string | null;
    teamId: string;
  }>;
}

// Ongoing project summary
export interface OngoingProject {
  id: string;
  name: string;
  status: string;
  projectLeader: string | null;
  bookingClient: string | null;
  eventDate: string | null;
  deliveryAddress: string | null;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  rigDate: string | null;
}

// Completed work today
export interface CompletedToday {
  id: string;
  type: 'project' | 'task' | 'time_report';
  title: string;
  completedAt: Date;
  staffName: string | null;
  details: string | null;
}

// Dashboard summary stats
export interface PlanningStats {
  availableToday: number;
  workingNow: number;
  ongoingProjects: number;
  completedToday: number;
  upcomingRigs: number;
}

// Unopened booking
export interface UnopenedBooking {
  id: string;
  bookingNumber: string | null;
  client: string;
  eventDate: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  status: string | null;
}

const teamNames: Record<string, string> = {
  'team-1': 'Team 1',
  'team-2': 'Team 2',
  'team-3': 'Team 3',
  'team-4': 'Team 4',
  'team-5': 'Team 5',
  'team-6': 'Team 6',
  'team-7': 'Team 7',
  'team-8': 'Team 8',
  'team-9': 'Team 9',
  'team-10': 'Team 10',
  'team-11': 'Live'
};

export const fetchPlanningStats = async (): Promise<PlanningStats> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const [
    staffResult,
    assignmentsResult,
    availabilityResult,
    projectsResult,
    timeReportsResult,
    upcomingRigsResult
  ] = await Promise.all([
    supabase.from('staff_members').select('id', { count: 'exact' }).eq('is_active', true),
    supabase.from('staff_assignments').select('staff_id', { count: 'exact' }).eq('assignment_date', today),
    supabase.from('staff_availability').select('staff_id').eq('availability_type', 'available').lte('start_date', today).gte('end_date', today),
    supabase.from('projects').select('id', { count: 'exact' }).neq('status', 'completed'),
    supabase.from('time_reports').select('id', { count: 'exact' }).eq('report_date', today),
    supabase.from('calendar_events').select('id', { count: 'exact' }).eq('event_type', 'Rigg').gte('start_time', todayStart).lte('start_time', endOfDay(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString())
  ]);

  return {
    availableToday: availabilityResult.data?.length || 0,
    workingNow: assignmentsResult.count || 0,
    ongoingProjects: projectsResult.count || 0,
    completedToday: timeReportsResult.count || 0,
    upcomingRigs: upcomingRigsResult.count || 0
  };
};

// Fetch all staff with active status and current team assignment
export const fetchAllStaff = async (): Promise<AllStaffMember[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: allStaff, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, color, role, is_active')
    .order('name');

  if (staffError) {
    console.error('Error fetching all staff:', staffError);
    return [];
  }

  // Get today's assignments
  const { data: assignments } = await supabase
    .from('staff_assignments')
    .select('staff_id, team_id')
    .eq('assignment_date', today);

  const assignmentMap = new Map(assignments?.map(a => [a.staff_id, a.team_id]) || []);

  return (allStaff || []).map(staff => ({
    id: staff.id,
    name: staff.name,
    color: staff.color,
    role: staff.role,
    isActive: staff.is_active,
    currentTeam: assignmentMap.get(staff.id) || null,
    currentTeamName: assignmentMap.has(staff.id) ? teamNames[assignmentMap.get(staff.id)!] || null : null
  }));
};

// Toggle staff active status
export const toggleStaffActive = async (staffId: string, isActive: boolean): Promise<void> => {
  const { error } = await supabase
    .from('staff_members')
    .update({ is_active: isActive } as any)
    .eq('id', staffId);

  if (error) {
    console.error('Error updating staff active status:', error);
    throw error;
  }
};

// Fetch week assignments for drop zones
export const fetchWeekAssignments = async (): Promise<DayAssignment[]> => {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  const { data: assignments, error } = await supabase
    .from('staff_assignments')
    .select(`
      staff_id,
      team_id,
      assignment_date,
      staff_members (
        id,
        name,
        color
      )
    `)
    .gte('assignment_date', startStr)
    .lte('assignment_date', endStr);

  if (error) {
    console.error('Error fetching week assignments:', error);
    return [];
  }

  // Group by date and team
  const groupedMap = new Map<string, DayAssignment>();

  (assignments || []).forEach(a => {
    const key = `${a.assignment_date}-${a.team_id}`;
    const staffMember = a.staff_members as any;
    
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        date: new Date(a.assignment_date),
        teamId: a.team_id,
        teamName: teamNames[a.team_id] || a.team_id,
        staff: []
      });
    }
    
    groupedMap.get(key)!.staff.push({
      id: staffMember.id,
      name: staffMember.name,
      color: staffMember.color
    });
  });

  return Array.from(groupedMap.values());
};

// Assign staff to team on specific date
export const assignStaffToDay = async (staffId: string, teamId: string, date: Date): Promise<void> => {
  const dateStr = format(date, 'yyyy-MM-dd');

  // First remove any existing assignment for this staff on this date
  await supabase
    .from('staff_assignments')
    .delete()
    .eq('staff_id', staffId)
    .eq('assignment_date', dateStr);

  // Create new assignment
  const { error } = await supabase
    .from('staff_assignments')
    .insert({
      staff_id: staffId,
      team_id: teamId,
      assignment_date: dateStr
    });

  if (error) {
    console.error('Error assigning staff:', error);
    throw error;
  }
};

export const fetchStaffLocations = async (): Promise<StaffLocation[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Get today's assignments with booking info
  const { data: assignments, error: assignmentsError } = await supabase
    .from('staff_assignments')
    .select(`
      staff_id,
      team_id,
      staff_members!inner (
        id,
        name
      )
    `)
    .eq('assignment_date', today);

  if (assignmentsError) {
    console.error('Error fetching assignments:', assignmentsError);
    return [];
  }

  // Get today's time reports to see who's working
  const { data: timeReports } = await supabase
    .from('time_reports')
    .select('staff_id, booking_id, created_at')
    .eq('report_date', today);

  const workingStaffIds = new Set(timeReports?.map(tr => tr.staff_id) || []);
  const staffReportMap = new Map(timeReports?.map(tr => [tr.staff_id, tr]) || []);

  // Get calendar events for today to get booking info
  const { data: events } = await supabase
    .from('calendar_events')
    .select('booking_id, resource_id')
    .gte('start_time', startOfDay(new Date()).toISOString())
    .lte('end_time', endOfDay(new Date()).toISOString());

  const teamBookingMap = new Map<string, string>();
  events?.forEach(e => {
    if (e.booking_id) {
      teamBookingMap.set(e.resource_id, e.booking_id);
    }
  });

  // Get booking details for locations
  const bookingIds = [...new Set([...teamBookingMap.values()])];
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client, deliveryaddress, delivery_latitude, delivery_longitude')
    .in('id', bookingIds.length > 0 ? bookingIds : ['none']);

  const bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);

  // Map team IDs to names
  const teamNames: Record<string, string> = {
    'team-1': 'Team 1',
    'team-2': 'Team 2',
    'team-3': 'Team 3',
    'team-4': 'Team 4',
    'team-5': 'Team 5',
    'team-6': 'Team 6',
    'team-7': 'Team 7',
    'team-8': 'Team 8',
    'team-9': 'Team 9',
    'team-10': 'Team 10',
    'team-11': 'Live'
  };

  return (assignments || []).map(assignment => {
    const staffMember = assignment.staff_members as any;
    const bookingId = teamBookingMap.get(assignment.team_id);
    const booking = bookingId ? bookingMap.get(bookingId) : null;
    const report = staffReportMap.get(assignment.staff_id);

    return {
      id: staffMember.id,
      name: staffMember.name,
      teamId: assignment.team_id,
      teamName: teamNames[assignment.team_id] || assignment.team_id,
      bookingId: bookingId || null,
      bookingClient: booking?.client || null,
      deliveryAddress: booking?.deliveryaddress || null,
      latitude: booking?.delivery_latitude || null,
      longitude: booking?.delivery_longitude || null,
      isWorking: workingStaffIds.has(assignment.staff_id),
      lastReportTime: report?.created_at || null
    };
  });
};

export const fetchAvailableStaff = async (): Promise<AvailableStaff[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Get all active staff
  const { data: allStaff, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, color, role')
    .eq('is_active', true);

  if (staffError) {
    console.error('Error fetching staff:', staffError);
    return [];
  }

  // Get today's assignments
  const { data: assignments } = await supabase
    .from('staff_assignments')
    .select('staff_id')
    .eq('assignment_date', today);

  const assignedIds = new Set(assignments?.map(a => a.staff_id) || []);

  // Get availability info
  const { data: availability } = await supabase
    .from('staff_availability')
    .select('staff_id, availability_type')
    .lte('start_date', today)
    .gte('end_date', today);

  const availabilityMap = new Map(availability?.map(a => [a.staff_id, a.availability_type]) || []);

  // Filter to unassigned staff with availability
  return (allStaff || [])
    .filter(staff => !assignedIds.has(staff.id))
    .filter(staff => {
      const avail = availabilityMap.get(staff.id);
      return avail === 'available' || avail === undefined;
    })
    .map(staff => ({
      id: staff.id,
      name: staff.name,
      color: staff.color,
      role: staff.role,
      availabilityType: availabilityMap.get(staff.id) || 'available'
    }));
};

export const fetchOngoingProjects = async (): Promise<OngoingProject[]> => {
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      project_leader,
      booking_id,
      bookings (
        client,
        eventdate,
        rigdaydate,
        deliveryaddress
      )
    `)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
    return [];
  }

  // Get task counts
  const projectsWithTasks = await Promise.all(
    (projects || []).map(async (project) => {
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('id, completed')
        .eq('project_id', project.id);

      const totalTasks = tasks?.length || 0;
      const completedTasks = tasks?.filter(t => t.completed).length || 0;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const booking = project.bookings as any;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        projectLeader: project.project_leader,
        bookingClient: booking?.client || null,
        eventDate: booking?.eventdate || null,
        deliveryAddress: booking?.deliveryaddress || null,
        totalTasks,
        completedTasks,
        progress,
        rigDate: booking?.rigdaydate || null
      };
    })
  );

  return projectsWithTasks;
};

export const fetchCompletedToday = async (): Promise<CompletedToday[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();
  const completed: CompletedToday[] = [];

  // Fetch completed tasks today
  const { data: tasks } = await supabase
    .from('project_tasks')
    .select(`
      id,
      title,
      updated_at,
      assigned_to,
      projects (name)
    `)
    .eq('completed', true)
    .gte('updated_at', todayStart)
    .lte('updated_at', todayEnd);

  tasks?.forEach(task => {
    completed.push({
      id: `task-${task.id}`,
      type: 'task',
      title: task.title,
      completedAt: new Date(task.updated_at),
      staffName: task.assigned_to,
      details: `Projekt: ${(task.projects as any)?.name || 'Okänt'}`
    });
  });

  // Fetch time reports submitted today
  const { data: reports } = await supabase
    .from('time_reports')
    .select(`
      id,
      hours_worked,
      description,
      created_at,
      staff_id,
      booking_id,
      staff_members (name),
      bookings (client)
    `)
    .eq('report_date', today)
    .order('created_at', { ascending: false });

  reports?.forEach(report => {
    const staffName = (report.staff_members as any)?.name || 'Okänd';
    const client = (report.bookings as any)?.client || 'Okänd bokning';
    
    completed.push({
      id: `report-${report.id}`,
      type: 'time_report',
      title: `${staffName} rapporterade ${report.hours_worked}h`,
      completedAt: new Date(report.created_at),
      staffName,
      details: `${client}${report.description ? ` - ${report.description}` : ''}`
    });
  });

  // Fetch projects marked as completed today
  const { data: completedProjects } = await supabase
    .from('projects')
    .select('id, name, updated_at, project_leader')
    .eq('status', 'completed')
    .gte('updated_at', todayStart)
    .lte('updated_at', todayEnd);

  completedProjects?.forEach(project => {
    completed.push({
      id: `project-${project.id}`,
      type: 'project',
      title: `Projekt avslutat: ${project.name}`,
      completedAt: new Date(project.updated_at),
      staffName: project.project_leader,
      details: null
    });
  });

  return completed.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
};

// Fetch week projects with assigned staff
export const fetchWeekProjects = async (): Promise<WeekProject[]> => {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  // Get bookings that have events this week (rig, event, or rigdown)
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_number,
      client,
      deliveryaddress,
      rigdaydate,
      eventdate,
      rigdowndate
    `)
    .eq('status', 'CONFIRMED')
    .or(`rigdaydate.gte.${startStr},eventdate.gte.${startStr},rigdowndate.gte.${startStr}`)
    .or(`rigdaydate.lte.${endStr},eventdate.lte.${endStr},rigdowndate.lte.${endStr}`);

  if (bookingsError) {
    console.error('Error fetching week bookings:', bookingsError);
    return [];
  }

  // Get staff assignments for the week
  const { data: assignments } = await supabase
    .from('staff_assignments')
    .select(`
      staff_id,
      team_id,
      assignment_date,
      staff_members (
        id,
        name,
        color
      )
    `)
    .gte('assignment_date', startStr)
    .lte('assignment_date', endStr);

  // Get calendar events to link bookings to dates
  const { data: calendarEvents } = await supabase
    .from('calendar_events')
    .select('booking_id, event_type, start_time, resource_id')
    .gte('start_time', weekStart.toISOString())
    .lte('start_time', weekEnd.toISOString());

  // Build a map of booking+date to staff assignments via calendar events
  const eventToTeamMap = new Map<string, { bookingId: string; date: string; eventType: string; teamId: string }>();
  calendarEvents?.forEach(e => {
    if (e.booking_id) {
      const dateStr = format(new Date(e.start_time), 'yyyy-MM-dd');
      const key = `${e.booking_id}-${dateStr}`;
      eventToTeamMap.set(key, {
        bookingId: e.booking_id,
        date: dateStr,
        eventType: e.event_type || 'Event',
        teamId: e.resource_id
      });
    }
  });

  // Build staff assignment map by date and team
  const staffByDateTeam = new Map<string, Array<{ id: string; name: string; color: string | null; teamId: string }>>();
  assignments?.forEach(a => {
    const key = `${a.assignment_date}-${a.team_id}`;
    const staffMember = a.staff_members as any;
    if (!staffByDateTeam.has(key)) {
      staffByDateTeam.set(key, []);
    }
    staffByDateTeam.get(key)!.push({
      id: staffMember.id,
      name: staffMember.name,
      color: staffMember.color,
      teamId: a.team_id
    });
  });

  // Build week projects list
  const weekProjects: WeekProject[] = [];
  
  eventToTeamMap.forEach((eventInfo, key) => {
    const booking = bookings?.find(b => b.id === eventInfo.bookingId);
    if (!booking) return;

    const staffKey = `${eventInfo.date}-${eventInfo.teamId}`;
    const assignedStaff = staffByDateTeam.get(staffKey) || [];

    weekProjects.push({
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      client: booking.client,
      eventType: eventInfo.eventType,
      deliveryAddress: booking.deliveryaddress,
      date: new Date(eventInfo.date),
      rigDate: booking.rigdaydate,
      eventDate: booking.eventdate,
      rigdownDate: booking.rigdowndate,
      assignedStaff
    });
  });

  return weekProjects.sort((a, b) => a.date.getTime() - b.date.getTime());
};

// Assign staff to a booking on specific date
export const assignStaffToBooking = async (staffId: string, bookingId: string, date: Date): Promise<void> => {
  const dateStr = format(date, 'yyyy-MM-dd');

  // Find which team/resource this booking is on for this date
  const { data: calendarEvent } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .eq('booking_id', bookingId)
    .gte('start_time', `${dateStr}T00:00:00`)
    .lte('start_time', `${dateStr}T23:59:59`)
    .limit(1)
    .single();

  const teamId = calendarEvent?.resource_id || 'team-1';

  // Remove any existing assignment for this staff on this date
  await supabase
    .from('staff_assignments')
    .delete()
    .eq('staff_id', staffId)
    .eq('assignment_date', dateStr);

  // Create new assignment
  const { error } = await supabase
    .from('staff_assignments')
    .insert({
      staff_id: staffId,
      team_id: teamId,
      assignment_date: dateStr
    });

  if (error) {
    console.error('Error assigning staff to booking:', error);
    throw error;
  }
};

// Fetch unopened bookings (viewed = false) - only future events
export const fetchUnopenedBookings = async (): Promise<UnopenedBooking[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_number,
      client,
      eventdate,
      rigdaydate,
      rigdowndate,
      deliveryaddress,
      created_at,
      status
    `)
    .eq('viewed', false)
    .or(`eventdate.gte.${today},rigdaydate.gte.${today},rigdowndate.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching unopened bookings:', error);
    return [];
  }

  // Filter to only include bookings where at least one date is in the future
  const filteredData = (data || []).filter(b => {
    const eventDate = b.eventdate ? new Date(b.eventdate) : null;
    const rigDate = b.rigdaydate ? new Date(b.rigdaydate) : null;
    const rigdownDate = b.rigdowndate ? new Date(b.rigdowndate) : null;
    const todayDate = new Date(today);
    
    return (
      (eventDate && eventDate >= todayDate) ||
      (rigDate && rigDate >= todayDate) ||
      (rigdownDate && rigdownDate >= todayDate)
    );
  });

  return filteredData.map(b => ({
    id: b.id,
    bookingNumber: b.booking_number,
    client: b.client,
    eventDate: b.eventdate,
    deliveryAddress: b.deliveryaddress,
    createdAt: b.created_at,
    status: b.status
  }));
};
