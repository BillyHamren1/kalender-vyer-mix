import { supabase } from "@/integrations/supabase/client";
import { format, addDays, subDays, startOfDay, endOfDay, isAfter, isBefore } from "date-fns";

export interface WarehouseStats {
  upcomingJobs: number;
  activePackings: number;
  urgentPackings: number;
  overdueTasks: number;
}

export interface UpcomingJob {
  id: string;
  client: string;
  bookingNumber: string | null;
  eventDate: string | null;
  rigDate: string | null;
  rigdownDate: string | null;
  deliveryAddress: string | null;
  daysUntilRig: number;
  hasActivePacking: boolean;
  packingId?: string;
  packingStatus?: string;
}

export interface UrgentPacking {
  id: string;
  name: string;
  status: string;
  bookingId: string | null;
  client: string | null;
  eventDate: string | null;
  rigDate: string | null;
  daysUntilRig: number;
  urgencyLevel: 'critical' | 'urgent' | 'approaching' | 'normal';
  taskProgress: {
    completed: number;
    total: number;
  };
}

export interface ActivePacking {
  id: string;
  name: string;
  status: string;
  projectLeader: string | null;
  bookingId: string | null;
  client: string | null;
  eventDate: string | null;
  rigDate: string | null;
  taskProgress: {
    completed: number;
    total: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PackingTask {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  completed: boolean;
  assignedTo: string | null;
  packingId: string;
  packingName: string;
  isOverdue: boolean;
  daysUntilDeadline: number | null;
}

// Fetch warehouse dashboard stats
export const fetchWarehouseStats = async (): Promise<WarehouseStats> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const twoWeeksFromNow = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  // Count upcoming jobs (bookings with event date in next 14 days)
  const { count: upcomingJobsCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('eventdate', today)
    .lte('eventdate', twoWeeksFromNow)
    .eq('status', 'CONFIRMED');

  // Count active packings (status = 'in_progress')
  const { count: activePackingsCount } = await supabase
    .from('packing_projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_progress');

  // For urgent packings, we need to check packing projects linked to bookings with rig date within 7 days
  const sevenDaysFromNow = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  
  const { data: urgentPackingsData } = await supabase
    .from('packing_projects')
    .select(`
      id,
      booking_id,
      status
    `)
    .neq('status', 'completed');

  // Get bookings for these packings to check rig dates
  let urgentCount = 0;
  if (urgentPackingsData && urgentPackingsData.length > 0) {
    const bookingIds = urgentPackingsData
      .filter(p => p.booking_id)
      .map(p => p.booking_id);
    
    if (bookingIds.length > 0) {
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, rigdaydate')
        .in('id', bookingIds)
        .lte('rigdaydate', sevenDaysFromNow)
        .gte('rigdaydate', today);

      urgentCount = bookingsData?.length || 0;
    }
  }

  // Count overdue tasks (deadline < today AND not completed)
  const { count: overdueTasksCount } = await supabase
    .from('packing_tasks')
    .select('*', { count: 'exact', head: true })
    .lt('deadline', today)
    .eq('completed', false);

  return {
    upcomingJobs: upcomingJobsCount || 0,
    activePackings: activePackingsCount || 0,
    urgentPackings: urgentCount,
    overdueTasks: overdueTasksCount || 0
  };
};

// Fetch upcoming jobs for the timeline
export const fetchUpcomingJobs = async (): Promise<UpcomingJob[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const twoWeeksFromNow = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, client, booking_number, eventdate, rigdaydate, rigdowndate, deliveryaddress')
    .gte('rigdaydate', today)
    .lte('rigdaydate', twoWeeksFromNow)
    .eq('status', 'CONFIRMED')
    .order('rigdaydate', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming jobs:', error);
    return [];
  }

  // Get packings linked to these bookings
  const bookingIds = bookings?.map(b => b.id) || [];
  const { data: packings } = await supabase
    .from('packing_projects')
    .select('id, booking_id, status')
    .in('booking_id', bookingIds);

  const packingMap = new Map(packings?.map(p => [p.booking_id, p]) || []);

  return (bookings || []).map(booking => {
    const rigDate = booking.rigdaydate ? new Date(booking.rigdaydate) : null;
    const daysUntilRig = rigDate 
      ? Math.ceil((rigDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    const packing = packingMap.get(booking.id);

    return {
      id: booking.id,
      client: booking.client,
      bookingNumber: booking.booking_number,
      eventDate: booking.eventdate,
      rigDate: booking.rigdaydate,
      rigdownDate: booking.rigdowndate,
      deliveryAddress: booking.deliveryaddress,
      daysUntilRig,
      hasActivePacking: !!packing,
      packingId: packing?.id,
      packingStatus: packing?.status
    };
  });
};

// Calculate urgency level based on days until rig
const getUrgencyLevel = (daysUntilRig: number): 'critical' | 'urgent' | 'approaching' | 'normal' => {
  if (daysUntilRig < 3) return 'critical';
  if (daysUntilRig < 5) return 'urgent';
  if (daysUntilRig < 7) return 'approaching';
  return 'normal';
};

// Fetch urgent packings (with approaching deadlines)
export const fetchUrgentPackings = async (): Promise<UrgentPacking[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const sevenDaysFromNow = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  // Get all non-completed packings
  const { data: packings, error } = await supabase
    .from('packing_projects')
    .select(`
      id,
      name,
      status,
      booking_id
    `)
    .neq('status', 'completed');

  if (error || !packings) {
    console.error('Error fetching urgent packings:', error);
    return [];
  }

  // Get linked bookings
  const bookingIds = packings.filter(p => p.booking_id).map(p => p.booking_id);
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client, eventdate, rigdaydate')
    .in('id', bookingIds)
    .lte('rigdaydate', sevenDaysFromNow)
    .gte('rigdaydate', today);

  const bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);

  // Get task progress for each packing
  const packingIds = packings.map(p => p.id);
  const { data: tasks } = await supabase
    .from('packing_tasks')
    .select('packing_id, completed')
    .in('packing_id', packingIds);

  const taskProgressMap = new Map<string, { completed: number; total: number }>();
  tasks?.forEach(task => {
    const current = taskProgressMap.get(task.packing_id) || { completed: 0, total: 0 };
    current.total++;
    if (task.completed) current.completed++;
    taskProgressMap.set(task.packing_id, current);
  });

  // Filter to only urgent packings and map the data
  return packings
    .filter(p => p.booking_id && bookingMap.has(p.booking_id))
    .map(packing => {
      const booking = bookingMap.get(packing.booking_id!);
      const rigDate = booking?.rigdaydate ? new Date(booking.rigdaydate) : null;
      const daysUntilRig = rigDate 
        ? Math.ceil((rigDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        id: packing.id,
        name: packing.name,
        status: packing.status,
        bookingId: packing.booking_id,
        client: booking?.client || null,
        eventDate: booking?.eventdate || null,
        rigDate: booking?.rigdaydate || null,
        daysUntilRig,
        urgencyLevel: getUrgencyLevel(daysUntilRig),
        taskProgress: taskProgressMap.get(packing.id) || { completed: 0, total: 0 }
      };
    })
    .sort((a, b) => a.daysUntilRig - b.daysUntilRig);
};

// Fetch active packings (status = 'in_progress')
export const fetchActivePackings = async (): Promise<ActivePacking[]> => {
  const { data: packings, error } = await supabase
    .from('packing_projects')
    .select(`
      id,
      name,
      status,
      project_leader,
      booking_id,
      created_at,
      updated_at
    `)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false });

  if (error || !packings) {
    console.error('Error fetching active packings:', error);
    return [];
  }

  // Get linked bookings
  const bookingIds = packings.filter(p => p.booking_id).map(p => p.booking_id);
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client, eventdate, rigdaydate')
    .in('id', bookingIds);

  const bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);

  // Get task progress
  const packingIds = packings.map(p => p.id);
  const { data: tasks } = await supabase
    .from('packing_tasks')
    .select('packing_id, completed')
    .in('packing_id', packingIds);

  const taskProgressMap = new Map<string, { completed: number; total: number }>();
  tasks?.forEach(task => {
    const current = taskProgressMap.get(task.packing_id) || { completed: 0, total: 0 };
    current.total++;
    if (task.completed) current.completed++;
    taskProgressMap.set(task.packing_id, current);
  });

  return packings.map(packing => {
    const booking = packing.booking_id ? bookingMap.get(packing.booking_id) : null;

    return {
      id: packing.id,
      name: packing.name,
      status: packing.status,
      projectLeader: packing.project_leader,
      bookingId: packing.booking_id,
      client: booking?.client || null,
      eventDate: booking?.eventdate || null,
      rigDate: booking?.rigdaydate || null,
      taskProgress: taskProgressMap.get(packing.id) || { completed: 0, total: 0 },
      createdAt: packing.created_at,
      updatedAt: packing.updated_at
    };
  });
};

// Fetch tasks needing attention (overdue or due soon)
export const fetchPackingTasksAttention = async (): Promise<PackingTask[]> => {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  const todayStr = format(today, 'yyyy-MM-dd');
  const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('packing_tasks')
    .select(`
      id,
      title,
      description,
      deadline,
      completed,
      assigned_to,
      packing_id
    `)
    .eq('completed', false)
    .not('deadline', 'is', null)
    .lte('deadline', nextWeekStr)
    .order('deadline', { ascending: true });

  if (error || !tasks) {
    console.error('Error fetching packing tasks:', error);
    return [];
  }

  // Get packing names
  const packingIds = [...new Set(tasks.map(t => t.packing_id))];
  const { data: packings } = await supabase
    .from('packing_projects')
    .select('id, name')
    .in('id', packingIds);

  const packingMap = new Map(packings?.map(p => [p.id, p.name]) || []);

  return tasks.map(task => {
    const deadline = task.deadline ? new Date(task.deadline) : null;
    const isOverdue = deadline ? isBefore(deadline, startOfDay(today)) : false;
    const daysUntilDeadline = deadline 
      ? Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      completed: task.completed,
      assignedTo: task.assigned_to,
      packingId: task.packing_id,
      packingName: packingMap.get(task.packing_id) || 'Okänt projekt',
      isOverdue,
      daysUntilDeadline
    };
  });
};
