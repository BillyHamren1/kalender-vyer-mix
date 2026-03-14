import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, addHours } from "date-fns";

// === Map-specific types ===
export interface OpsMapJob {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  deliveryAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  assignedStaff: { id: string; name: string }[];
  isActive: boolean;
}

export const fetchOpsMapJobs = async (): Promise<OpsMapJob[]> => {
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();
  const today = format(now, 'yyyy-MM-dd');

  // Get today's calendar events with booking info
  const { data: events } = await supabase
    .from('calendar_events')
    .select('booking_id, start_time, end_time, event_type, delivery_address')
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd);

  if (!events?.length) return [];

  const bookingIds = [...new Set(events.filter(e => e.booking_id).map(e => e.booking_id!))];
  if (!bookingIds.length) return [];

  const [bookingsResult, assignmentsResult] = await Promise.all([
    supabase.from('bookings')
      .select('id, booking_number, client, deliveryaddress, delivery_latitude, delivery_longitude')
      .in('id', bookingIds),
    supabase.from('booking_staff_assignments')
      .select('booking_id, staff_id')
      .eq('assignment_date', today)
      .in('booking_id', bookingIds),
  ]);

  const bookingMap = new Map((bookingsResult.data || []).map(b => [b.id, b]));

  // Get staff names
  const staffIds = [...new Set((assignmentsResult.data || []).map(a => a.staff_id))];
  let staffMap = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffData } = await supabase
      .from('staff_members' as any)
      .select('id, name')
      .in('id', staffIds);
    staffMap = new Map((staffData || []).map((s: any) => [s.id, s.name]));
  }

  // Group assignments by booking
  const assignmentsByBooking = new Map<string, { id: string; name: string }[]>();
  for (const a of (assignmentsResult.data || [])) {
    if (!assignmentsByBooking.has(a.booking_id)) assignmentsByBooking.set(a.booking_id, []);
    assignmentsByBooking.get(a.booking_id)!.push({ id: a.staff_id, name: staffMap.get(a.staff_id) || 'Okänd' });
  }

  // Build per-booking (dedup)
  const seen = new Set<string>();
  const jobs: OpsMapJob[] = [];

  for (const e of events) {
    if (!e.booking_id || seen.has(e.booking_id)) continue;
    seen.add(e.booking_id);

    const booking = bookingMap.get(e.booking_id);
    if (!booking) continue;

    const start = e.start_time ? new Date(e.start_time) : null;
    const end = e.end_time ? new Date(e.end_time) : null;
    const isActive = !!(start && end && start <= now && end >= now);

    jobs.push({
      bookingId: e.booking_id,
      bookingNumber: booking.booking_number,
      client: booking.client,
      deliveryAddress: e.delivery_address || booking.deliveryaddress,
      latitude: booking.delivery_latitude,
      longitude: booking.delivery_longitude,
      eventType: e.event_type,
      startTime: e.start_time,
      endTime: e.end_time,
      assignedStaff: assignmentsByBooking.get(e.booking_id) || [],
      isActive,
    });
  }

  return jobs;
};

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
  teamId: string | null;
  teamName: string | null;
}

export interface OpsJobQueueItem {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  eventDate: string | null;
  rigDate: string | null;
  deliveryAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  assignedStaffCount: number;
  assignedStaffNames: string[];
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  updatedAt: string;
  issue: 'no_staff' | 'unopened' | 'starting_soon' | 'recently_modified';
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

export const fetchOpsTimeline = async (date?: Date): Promise<OpsTimelineStaff[]> => {
  const targetDate = date || new Date();
  const dateStr = format(targetDate, 'yyyy-MM-dd');
  const now = new Date();

  const [staffResult, assignmentsResult, bookingAssignmentsResult, availabilityResult] = await Promise.all([
    supabase.from('staff_members' as any).select('id, name, color, role, is_active').order('name'),
    supabase.from('staff_assignments').select('staff_id, team_id').eq('assignment_date', dateStr),
    supabase.from('booking_staff_assignments').select('staff_id, booking_id, team_id').eq('assignment_date', dateStr),
    supabase.from('staff_availability' as any).select('staff_id, availability_type').lte('start_date', dateStr).gte('end_date', dateStr),
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
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // Get bookings active today
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_number, client, eventdate, rigdaydate, deliveryaddress, delivery_latitude, delivery_longitude, status, viewed, updated_at')
    .or(`rigdaydate.eq.${today},eventdate.eq.${today},rigdowndate.eq.${today}`)
    .neq('status', 'CANCELLED')
    .order('eventdate');

  if (!bookings?.length) return [];

  const bookingIds = bookings.map(b => b.id);

  // Parallel fetches
  const [assignmentsResult, soonEventsResult, eventsResult] = await Promise.all([
    supabase.from('booking_staff_assignments').select('booking_id, staff_id').eq('assignment_date', today).in('booking_id', bookingIds),
    supabase.from('calendar_events').select('booking_id').gte('start_time', now.toISOString()).lte('start_time', twoHoursFromNow.toISOString()),
    supabase.from('calendar_events').select('booking_id, start_time, end_time, event_type').gte('start_time', startOfDay(now).toISOString()).lte('start_time', endOfDay(now).toISOString()).in('booking_id', bookingIds),
  ]);

  // Staff count + names
  const staffByBooking = new Map<string, string[]>();
  const staffIds = new Set<string>();
  for (const a of (assignmentsResult.data || [])) {
    if (!staffByBooking.has(a.booking_id)) staffByBooking.set(a.booking_id, []);
    staffByBooking.get(a.booking_id)!.push(a.staff_id);
    staffIds.add(a.staff_id);
  }

  let staffNameMap = new Map<string, string>();
  if (staffIds.size > 0) {
    const { data: staffData } = await supabase.from('staff_members' as any).select('id, name').in('id', [...staffIds]);
    staffNameMap = new Map((staffData || []).map((s: any) => [s.id, s.name]));
  }

  const soonBookingIds = new Set((soonEventsResult.data || []).map(e => e.booking_id).filter(Boolean));

  // Events by booking
  const eventsByBooking = new Map<string, any>();
  for (const e of (eventsResult.data || [])) {
    if (e.booking_id && !eventsByBooking.has(e.booking_id)) eventsByBooking.set(e.booking_id, e);
  }

  const queue: OpsJobQueueItem[] = [];

  for (const b of bookings) {
    const staffIdList = staffByBooking.get(b.id) || [];
    const staffCount = staffIdList.length;
    const staffNames = staffIdList.map(id => staffNameMap.get(id) || 'Okänd');
    const event = eventsByBooking.get(b.id);
    const recentlyModified = b.updated_at && b.updated_at >= oneHourAgo;

    let issue: OpsJobQueueItem['issue'] | null = null;
    if (staffCount === 0) issue = 'no_staff';
    else if (soonBookingIds.has(b.id)) issue = 'starting_soon';
    else if (!b.viewed) issue = 'unopened';
    else if (recentlyModified) issue = 'recently_modified';

    if (issue) {
      queue.push({
        bookingId: b.id,
        bookingNumber: b.booking_number,
        client: b.client,
        eventDate: b.eventdate,
        rigDate: b.rigdaydate,
        deliveryAddress: b.deliveryaddress,
        latitude: b.delivery_latitude,
        longitude: b.delivery_longitude,
        status: b.status,
        assignedStaffCount: staffCount,
        assignedStaffNames: staffNames,
        startTime: event?.start_time || null,
        endTime: event?.end_time || null,
        eventType: event?.event_type || null,
        updatedAt: b.updated_at,
        issue,
      });
    }
  }

  return queue.sort((a, b) => {
    const priority = { no_staff: 0, starting_soon: 1, unopened: 2, recently_modified: 3 };
    return priority[a.issue] - priority[b.issue];
  });
};
