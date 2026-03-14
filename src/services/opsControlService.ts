import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, addHours } from "date-fns";

export interface OpsMetrics {
  totalJobsToday: number;
  staffScheduledToday: number;
  jobsMissingStaff: number;
  jobsStartingSoon: number;
  activeJobsNow: number;
  staffCheckedIn: number;
  conflictsDetected: number;
}

export interface OpsTimelineAssignment {
  bookingId: string;
  client: string;
  teamId: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  deliveryAddress: string | null;
  bookingNumber: string | null;
}

export interface OpsTimelineStaff {
  id: string;
  name: string;
  color: string | null;
  role: string | null;
  status: 'available' | 'assigned' | 'off_duty';
  assignments: OpsTimelineAssignment[];
  hasConflict: boolean;
  currentJob: OpsTimelineAssignment | null;
  nextJob: OpsTimelineAssignment | null;
}

export interface OpsJobQueueItem {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  eventDate: string | null;
  rigDate: string | null;
  deliveryAddress: string | null;
  status: string | null;
  assignedStaffCount: number;
  issue: 'no_staff' | 'unopened' | 'starting_soon';
}

export const fetchOpsMetrics = async (): Promise<OpsMetrics> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();
  const twoHoursFromNow = addHours(now, 2).toISOString();

  const [
    todayEvents,
    staffAssignments,
    bookingAssignments,
    activeEvents,
    timeReports,
    allTodayBookings,
  ] = await Promise.all([
    // All calendar events today
    supabase.from('calendar_events').select('id, booking_id, start_time, end_time', { count: 'exact' })
      .gte('start_time', todayStart).lte('start_time', todayEnd),
    // Staff assigned today
    supabase.from('staff_assignments').select('staff_id', { count: 'exact' }).eq('assignment_date', today),
    // Booking staff assignments today
    supabase.from('booking_staff_assignments').select('booking_id, staff_id').eq('assignment_date', today),
    // Active events (started but not ended)
    supabase.from('calendar_events').select('id', { count: 'exact' })
      .lte('start_time', now.toISOString()).gte('end_time', now.toISOString()),
    // Time reports today (checked in)
    supabase.from('time_reports' as any).select('staff_id', { count: 'exact' }).eq('report_date', today),
    // Bookings with events today to check staffing
    supabase.from('bookings').select('id')
      .or(`rigdaydate.eq.${today},eventdate.eq.${today},rigdowndate.eq.${today}`)
      .neq('status', 'CANCELLED'),
  ]);

  // Events starting within 2 hours
  const startingSoonCount = (todayEvents.data || []).filter(e => {
    const start = new Date(e.start_time);
    return start > now && start <= new Date(twoHoursFromNow);
  }).length;

  // Find bookings with no staff assigned
  const assignedBookingIds = new Set((bookingAssignments.data || []).map(a => a.booking_id));
  const jobsMissingStaff = (allTodayBookings.data || []).filter(b => !assignedBookingIds.has(b.id)).length;

  // Detect conflicts: staff assigned to multiple bookings same day
  const staffBookingMap = new Map<string, Set<string>>();
  for (const a of (bookingAssignments.data || [])) {
    if (!staffBookingMap.has(a.staff_id)) staffBookingMap.set(a.staff_id, new Set());
    staffBookingMap.get(a.staff_id)!.add(a.booking_id);
  }
  const conflicts = [...staffBookingMap.values()].filter(s => s.size > 1).length;

  return {
    totalJobsToday: todayEvents.count || 0,
    staffScheduledToday: staffAssignments.count || 0,
    jobsMissingStaff,
    jobsStartingSoon: startingSoonCount,
    activeJobsNow: activeEvents.count || 0,
    staffCheckedIn: timeReports.count || 0,
    conflictsDetected: conflicts,
  };
};

export const fetchOpsTimeline = async (): Promise<OpsTimelineStaff[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();

  const [staffResult, assignmentsResult, bookingAssignmentsResult, availabilityResult] = await Promise.all([
    supabase.from('staff_members' as any).select('id, name, color, role, is_active').order('name'),
    supabase.from('staff_assignments').select('staff_id, team_id').eq('assignment_date', today),
    supabase.from('booking_staff_assignments').select('staff_id, booking_id, team_id').eq('assignment_date', today),
    supabase.from('staff_availability' as any).select('staff_id, availability_type').lte('start_date', today).gte('end_date', today),
  ]);

  const staff = (staffResult.data || []) as any[];
  const assignments = assignmentsResult.data || [];
  const bookingAssignments = bookingAssignmentsResult.data || [];
  const availability = (availabilityResult.data || []) as any[];

  // Availability map
  const availMap = new Map<string, string>();
  for (const a of availability) availMap.set(a.staff_id, a.availability_type);

  // Assigned staff set
  const assignedStaffIds = new Set([
    ...assignments.map(a => a.staff_id),
    ...bookingAssignments.map(a => a.staff_id),
  ]);

  // Get unique booking IDs
  const bookingIds = [...new Set(bookingAssignments.map(a => a.booking_id))];
  let bookingsMap = new Map<string, any>();

  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, client, deliveryaddress, booking_number')
      .in('id', bookingIds);
    for (const b of (bookings || [])) bookingsMap.set(b.id, b);
  }

  // Get calendar events for today
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();
  const { data: events } = await supabase
    .from('calendar_events')
    .select('booking_id, start_time, end_time, event_type, delivery_address')
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd);

  const eventsByBooking = new Map<string, any[]>();
  for (const e of (events || [])) {
    if (!e.booking_id) continue;
    if (!eventsByBooking.has(e.booking_id)) eventsByBooking.set(e.booking_id, []);
    eventsByBooking.get(e.booking_id)!.push(e);
  }

  return staff
    .filter(s => s.is_active)
    .map(s => {
      const staffBookingAssigns = bookingAssignments.filter(a => a.staff_id === s.id);
      const assignmentList: OpsTimelineAssignment[] = staffBookingAssigns.map(a => {
        const booking = bookingsMap.get(a.booking_id);
        const calEvents = eventsByBooking.get(a.booking_id) || [];
        const firstEvent = calEvents[0];
        return {
          bookingId: a.booking_id,
          client: booking?.client || 'Okänd',
          teamId: a.team_id,
          startTime: firstEvent?.start_time || null,
          endTime: firstEvent?.end_time || null,
          eventType: firstEvent?.event_type || null,
          deliveryAddress: firstEvent?.delivery_address || booking?.deliveryaddress || null,
          bookingNumber: booking?.booking_number || null,
        };
      });

      // Sort by start time
      assignmentList.sort((a, b) => {
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });

      // Detect overlapping assignments (conflict)
      let hasConflict = false;
      for (let i = 0; i < assignmentList.length - 1; i++) {
        const curr = assignmentList[i];
        const next = assignmentList[i + 1];
        if (curr.endTime && next.startTime && new Date(curr.endTime) > new Date(next.startTime)) {
          hasConflict = true;
          break;
        }
      }

      // Current and next job
      let currentJob: OpsTimelineAssignment | null = null;
      let nextJob: OpsTimelineAssignment | null = null;
      for (const a of assignmentList) {
        if (a.startTime && a.endTime) {
          const start = new Date(a.startTime);
          const end = new Date(a.endTime);
          if (start <= now && end >= now) currentJob = a;
          else if (start > now && !nextJob) nextJob = a;
        }
      }

      // Status
      const isAssigned = assignedStaffIds.has(s.id);
      const avail = availMap.get(s.id);
      let status: OpsTimelineStaff['status'] = 'off_duty';
      if (isAssigned) status = 'assigned';
      else if (avail === 'available') status = 'available';

      return {
        id: s.id,
        name: s.name,
        color: s.color,
        role: s.role,
        status,
        assignments: assignmentList,
        hasConflict,
        currentJob,
        nextJob,
      };
    })
    // Sort: assigned first, then available, then off_duty
    .sort((a, b) => {
      const order = { assigned: 0, available: 1, off_duty: 2 };
      return order[a.status] - order[b.status];
    });
};

export const fetchOpsJobQueue = async (): Promise<OpsJobQueueItem[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();
  const twoHoursFromNow = addHours(now, 2);

  // Get bookings active today
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_number, client, eventdate, rigdaydate, deliveryaddress, status, viewed')
    .or(`rigdaydate.eq.${today},eventdate.eq.${today},rigdowndate.eq.${today}`)
    .neq('status', 'CANCELLED')
    .order('eventdate');

  if (!bookings?.length) return [];

  // Get staff assignments for today
  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, staff_id')
    .eq('assignment_date', today);

  const staffCountMap = new Map<string, number>();
  for (const a of (assignments || [])) {
    staffCountMap.set(a.booking_id, (staffCountMap.get(a.booking_id) || 0) + 1);
  }

  // Get calendar events starting soon
  const { data: soonEvents } = await supabase
    .from('calendar_events')
    .select('booking_id')
    .gte('start_time', now.toISOString())
    .lte('start_time', twoHoursFromNow.toISOString());

  const soonBookingIds = new Set((soonEvents || []).map(e => e.booking_id).filter(Boolean));

  const queue: OpsJobQueueItem[] = [];

  for (const b of bookings) {
    const staffCount = staffCountMap.get(b.id) || 0;
    let issue: OpsJobQueueItem['issue'] | null = null;

    if (staffCount === 0) issue = 'no_staff';
    else if (!b.viewed) issue = 'unopened';
    else if (soonBookingIds.has(b.id)) issue = 'starting_soon';

    if (issue) {
      queue.push({
        bookingId: b.id,
        bookingNumber: b.booking_number,
        client: b.client,
        eventDate: b.eventdate,
        rigDate: b.rigdaydate,
        deliveryAddress: b.deliveryaddress,
        status: b.status,
        assignedStaffCount: staffCount,
        issue,
      });
    }
  }

  return queue.sort((a, b) => {
    const priority = { no_staff: 0, starting_soon: 1, unopened: 2 };
    return priority[a.issue] - priority[b.issue];
  });
};
