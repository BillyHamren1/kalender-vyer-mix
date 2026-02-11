import { supabase } from '@/integrations/supabase/client';

export interface MyProjectItem {
  id: string;
  name: string;
  type: 'standard' | 'large';
  status: string;
  clientName: string | null;
  eventDate: string | null;
  totalTasks: number;
  completedTasks: number;
  nextDeadline: string | null;
  role: 'leader' | 'assigned';
  projectLeader: string | null;
}

export const fetchMyProjects = async (staffId: string): Promise<MyProjectItem[]> => {
  const results: MyProjectItem[] = [];

  // --- Standard projects ---
  // 1. Projects where user is leader
  const { data: leaderProjects } = await supabase
    .from('projects')
    .select('id, name, status, booking_id, project_leader')
    .eq('project_leader', staffId)
    .neq('status', 'completed');

  // 2. Projects where user has assigned tasks
  const { data: assignedTasks } = await supabase
    .from('project_tasks')
    .select('project_id')
    .eq('assigned_to', staffId);

  const assignedProjectIds = [...new Set(
    (assignedTasks || []).map(t => t.project_id)
  )];

  // Fetch those projects (exclude already-found leader projects)
  const leaderProjectIds = new Set((leaderProjects || []).map(p => p.id));
  const additionalIds = assignedProjectIds.filter(id => !leaderProjectIds.has(id));

  let assignedProjects: typeof leaderProjects = [];
  if (additionalIds.length > 0) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, status, booking_id, project_leader')
      .in('id', additionalIds)
      .neq('status', 'completed');
    assignedProjects = data || [];
  }

  // Combine all standard project IDs
  const allStandardProjects = [
    ...(leaderProjects || []).map(p => ({ ...p, role: 'leader' as const })),
    ...(assignedProjects || []).map(p => ({ ...p, role: 'assigned' as const })),
  ];

  // Fetch tasks for all standard projects in one query
  const allStdIds = allStandardProjects.map(p => p.id);
  let allStdTasks: { project_id: string; completed: boolean; deadline: string | null }[] = [];
  if (allStdIds.length > 0) {
    const { data } = await supabase
      .from('project_tasks')
      .select('project_id, completed, deadline')
      .in('project_id', allStdIds);
    allStdTasks = data || [];
  }

  // Fetch booking info for projects with booking_id
  const bookingIds = allStandardProjects
    .map(p => p.booking_id)
    .filter((id): id is string => !!id);
  
  let bookingsMap: Record<string, { client: string; eventdate: string | null }> = {};
  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from('bookings')
      .select('id, client, eventdate')
      .in('id', bookingIds);
    (data || []).forEach(b => {
      bookingsMap[b.id] = { client: b.client, eventdate: b.eventdate };
    });
  }

  for (const project of allStandardProjects) {
    const tasks = allStdTasks.filter(t => t.project_id === project.id);
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks
      .filter(t => t.deadline && !t.completed)
      .map(t => t.deadline!)
      .sort();

    const booking = project.booking_id ? bookingsMap[project.booking_id] : null;

    results.push({
      id: project.id,
      name: project.name,
      type: 'standard',
      status: project.status,
      clientName: booking?.client || null,
      eventDate: booking?.eventdate || null,
      totalTasks: total,
      completedTasks: completed,
      nextDeadline: upcoming[0] || null,
      role: project.role,
      projectLeader: project.project_leader,
    });
  }

  // --- Large projects ---
  const { data: largeLeaderProjects } = await supabase
    .from('large_projects')
    .select('id, name, status, start_date, end_date, project_leader')
    .eq('project_leader', staffId)
    .neq('status', 'completed');

  const { data: largeAssignedTasks } = await supabase
    .from('large_project_tasks')
    .select('large_project_id')
    .eq('assigned_to', staffId);

  const largeAssignedIds = [...new Set(
    (largeAssignedTasks || []).map(t => t.large_project_id)
  )];
  const largeLeaderIds = new Set((largeLeaderProjects || []).map(p => p.id));
  const largeAdditionalIds = largeAssignedIds.filter(id => !largeLeaderIds.has(id));

  let largeAssignedProjects: typeof largeLeaderProjects = [];
  if (largeAdditionalIds.length > 0) {
    const { data } = await supabase
      .from('large_projects')
      .select('id, name, status, start_date, end_date, project_leader')
      .in('id', largeAdditionalIds)
      .neq('status', 'completed');
    largeAssignedProjects = data || [];
  }

  const allLargeProjects = [
    ...(largeLeaderProjects || []).map(p => ({ ...p, role: 'leader' as const })),
    ...(largeAssignedProjects || []).map(p => ({ ...p, role: 'assigned' as const })),
  ];

  const allLargeIds = allLargeProjects.map(p => p.id);
  let allLargeTasks: { large_project_id: string; completed: boolean | null; deadline: string | null }[] = [];
  if (allLargeIds.length > 0) {
    const { data } = await supabase
      .from('large_project_tasks')
      .select('large_project_id, completed, deadline')
      .in('large_project_id', allLargeIds);
    allLargeTasks = data || [];
  }

  for (const project of allLargeProjects) {
    const tasks = allLargeTasks.filter(t => t.large_project_id === project.id);
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks
      .filter(t => t.deadline && !t.completed)
      .map(t => t.deadline!)
      .sort();

    results.push({
      id: project.id,
      name: project.name,
      type: 'large',
      status: project.status,
      clientName: null,
      eventDate: project.start_date || null,
      totalTasks: total,
      completedTasks: completed,
      nextDeadline: upcoming[0] || null,
      role: project.role,
      projectLeader: project.project_leader,
    });
  }

  return results;
};
