import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, addDays, format, subDays } from "date-fns";

export interface DashboardStats {
  upcomingJobs: number;
  activeProjects: number;
  overdueTasks: number;
  totalStaff: number;
  confirmedBookings: number;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  eventType: string | null;
  bookingId: string | null;
  resourceId: string;
}

export interface AttentionTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  deadline: Date;
  isOverdue: boolean;
  assignedTo: string | null;
}

export interface ActiveProject {
  id: string;
  name: string;
  status: string;
  bookingId: string | null;
  eventDate: string | null;
  totalTasks: number;
  completedTasks: number;
  progress: number;
}

export interface StaffTodayStatus {
  assigned: Array<{
    id: string;
    name: string;
    teamId: string;
  }>;
  available: Array<{
    id: string;
    name: string;
  }>;
}

export interface RecentActivity {
  id: string;
  type: 'booking' | 'project' | 'task' | 'staff';
  message: string;
  timestamp: Date;
  relatedId?: string;
}

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  const today = startOfDay(new Date());
  const weekFromNow = endOfDay(addDays(today, 7));

  // Fetch all stats in parallel
  const [
    upcomingEventsResult,
    projectsResult,
    tasksResult,
    staffResult,
    bookingsResult
  ] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('id', { count: 'exact' })
      .gte('start_time', today.toISOString())
      .lte('start_time', weekFromNow.toISOString()),
    supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .neq('status', 'completed'),
    supabase
      .from('project_tasks')
      .select('id', { count: 'exact' })
      .eq('completed', false)
      .lt('deadline', format(today, 'yyyy-MM-dd')),
    supabase
      .from('staff_members')
      .select('id', { count: 'exact' })
      .eq('is_active', true),
    supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('status', 'CONFIRMED')
  ]);

  return {
    upcomingJobs: upcomingEventsResult.count || 0,
    activeProjects: projectsResult.count || 0,
    overdueTasks: tasksResult.count || 0,
    totalStaff: staffResult.count || 0,
    confirmedBookings: bookingsResult.count || 0
  };
};

export const fetchUpcomingEvents = async (days: number = 7): Promise<UpcomingEvent[]> => {
  const today = startOfDay(new Date());
  const endDate = endOfDay(addDays(today, days));

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', today.toISOString())
    .lte('start_time', endDate.toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return [];
  }

  return (data || []).map(event => ({
    id: event.id,
    title: event.title,
    startTime: new Date(event.start_time),
    endTime: new Date(event.end_time),
    eventType: event.event_type,
    bookingId: event.booking_id,
    resourceId: event.resource_id
  }));
};

export const fetchAttentionTasks = async (): Promise<AttentionTask[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const threeDaysFromNow = format(addDays(new Date(), 3), 'yyyy-MM-dd');

  // Fetch overdue and upcoming tasks
  const { data, error } = await supabase
    .from('project_tasks')
    .select(`
      id,
      title,
      deadline,
      assigned_to,
      project_id,
      projects!inner (
        id,
        name
      )
    `)
    .eq('completed', false)
    .not('deadline', 'is', null)
    .lte('deadline', threeDaysFromNow)
    .order('deadline', { ascending: true });

  if (error) {
    console.error('Error fetching attention tasks:', error);
    return [];
  }

  return (data || []).map(task => ({
    id: task.id,
    title: task.title,
    projectId: task.project_id,
    projectName: (task.projects as any)?.name || 'Okänt projekt',
    deadline: new Date(task.deadline!),
    isOverdue: task.deadline! < today,
    assignedTo: task.assigned_to
  }));
};

export const fetchActiveProjects = async (): Promise<ActiveProject[]> => {
  // Fetch projects with task counts
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      booking_id,
      bookings (
        eventdate
      )
    `)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
    return [];
  }

  // Fetch task counts for each project
  const projectsWithTasks = await Promise.all(
    (projects || []).map(async (project) => {
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('id, completed')
        .eq('project_id', project.id);

      const totalTasks = tasks?.length || 0;
      const completedTasks = tasks?.filter(t => t.completed).length || 0;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        bookingId: project.booking_id,
        eventDate: (project.bookings as any)?.eventdate || null,
        totalTasks,
        completedTasks,
        progress
      };
    })
  );

  return projectsWithTasks;
};

export const fetchTodayStaffStatus = async (): Promise<StaffTodayStatus> => {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Fetch all active staff
  const { data: allStaff, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name')
    .eq('is_active', true);

  if (staffError) {
    console.error('Error fetching staff:', staffError);
    return { assigned: [], available: [] };
  }

  // Fetch today's assignments
  const { data: assignments, error: assignmentsError } = await supabase
    .from('staff_assignments')
    .select('staff_id, team_id')
    .eq('assignment_date', today);

  if (assignmentsError) {
    console.error('Error fetching assignments:', assignmentsError);
    return { assigned: [], available: allStaff?.map(s => ({ id: s.id, name: s.name })) || [] };
  }

  const assignedStaffIds = new Set(assignments?.map(a => a.staff_id) || []);
  const assignmentMap = new Map(assignments?.map(a => [a.staff_id, a.team_id]) || []);

  const assigned = (allStaff || [])
    .filter(s => assignedStaffIds.has(s.id))
    .map(s => ({
      id: s.id,
      name: s.name,
      teamId: assignmentMap.get(s.id) || ''
    }));

  const available = (allStaff || [])
    .filter(s => !assignedStaffIds.has(s.id))
    .map(s => ({
      id: s.id,
      name: s.name
    }));

  return { assigned, available };
};

export const fetchRecentActivity = async (): Promise<RecentActivity[]> => {
  const sevenDaysAgo = subDays(new Date(), 7).toISOString();
  const activities: RecentActivity[] = [];

  // Fetch recent bookings
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select('id, client, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5);

  recentBookings?.forEach(booking => {
    activities.push({
      id: `booking-${booking.id}`,
      type: 'booking',
      message: `Ny bokning: ${booking.client}`,
      timestamp: new Date(booking.created_at),
      relatedId: booking.id
    });
  });

  // Fetch recent projects
  const { data: recentProjects } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5);

  recentProjects?.forEach(project => {
    activities.push({
      id: `project-${project.id}`,
      type: 'project',
      message: `Nytt projekt: ${project.name}`,
      timestamp: new Date(project.created_at),
      relatedId: project.id
    });
  });

  // Fetch recently completed tasks
  const { data: recentTasks } = await supabase
    .from('project_tasks')
    .select(`
      id,
      title,
      updated_at,
      projects (name)
    `)
    .eq('completed', true)
    .gte('updated_at', sevenDaysAgo)
    .order('updated_at', { ascending: false })
    .limit(5);

  recentTasks?.forEach(task => {
    activities.push({
      id: `task-${task.id}`,
      type: 'task',
      message: `Uppgift klar: ${task.title}`,
      timestamp: new Date(task.updated_at),
      relatedId: task.id
    });
  });

  // Sort all activities by timestamp
  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);
};
