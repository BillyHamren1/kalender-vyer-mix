
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from 'date-fns';

export interface MonthlyBookingSchedule {
  id: string;
  client: string;
  bookingId: string;
  assignedStaff: StaffAssignment[];
  rigDate?: string;
  rigTime?: string;
  eventDate?: string;
  eventTime?: string;
  rigDownDate?: string;
  rigDownTime?: string;
  internalNotes?: string;
  status: string;
  teamId?: string;
  teamName?: string;
}

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

export const fetchMonthlyBookingSchedule = async (currentDate: Date): Promise<MonthlyBookingSchedule[]> => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  console.log(`Fetching monthly schedule for: ${format(monthStart, 'yyyy-MM-dd')} to ${format(monthEnd, 'yyyy-MM-dd')}`);

  // Get all calendar events for the month
  const { data: events, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', monthStart.toISOString())
    .lte('start_time', monthEnd.toISOString())
    .not('booking_id', 'is', null);

  if (eventsError) {
    console.error('Error fetching calendar events:', eventsError);
    throw eventsError;
  }

  if (!events || events.length === 0) {
    return [];
  }

  // Get unique booking IDs from events
  const bookingIds = [...new Set(events.map(event => event.booking_id).filter(Boolean))];

  // Fetch booking details
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .in('id', bookingIds);

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    throw bookingsError;
  }

  // Get unique team IDs and dates for staff assignments
  const teamIds = [...new Set(events.map(event => event.resource_id))];
  const eventDates = [...new Set(events.map(event => format(new Date(event.start_time), 'yyyy-MM-dd')))];

  // Fetch staff assignments for these teams and dates
  const { data: staffAssignments, error: staffError } = await supabase
    .from('staff_assignments')
    .select(`
      *,
      staff_members (
        id,
        name
      )
    `)
    .in('team_id', teamIds)
    .in('assignment_date', eventDates);

  if (staffError) {
    console.error('Error fetching staff assignments:', staffError);
    throw staffError;
  }

  // Group events by booking
  const eventsByBooking = events.reduce((acc, event) => {
    if (event.booking_id) {
      if (!acc[event.booking_id]) acc[event.booking_id] = [];
      acc[event.booking_id].push(event);
    }
    return acc;
  }, {} as Record<string, any[]>);

  // Process bookings into schedule format
  const scheduleData: MonthlyBookingSchedule[] = [];

  for (const booking of bookings || []) {
    const bookingEvents = eventsByBooking[booking.id] || [];
    
    // Get unique dates for this booking
    const bookingDates = [...new Set(bookingEvents.map(event => format(new Date(event.start_time), 'yyyy-MM-dd')))];
    
    for (const date of bookingDates) {
      const dayEvents = bookingEvents.filter(event => 
        format(new Date(event.start_time), 'yyyy-MM-dd') === date
      );
      
      // Get staff for this date and teams
      const dayTeams = [...new Set(dayEvents.map(event => event.resource_id))];
      const dayStaff = staffAssignments?.filter(assignment => 
        assignment.assignment_date === date && dayTeams.includes(assignment.team_id)
      ) || [];

      // Find rig, event, and rig down times
      const rigEvent = dayEvents.find(e => e.event_type === 'rig');
      const eventEvent = dayEvents.find(e => e.event_type === 'event');
      const rigDownEvent = dayEvents.find(e => e.event_type === 'rigDown');

      scheduleData.push({
        id: `${booking.id}-${date}`,
        bookingId: booking.id,
        client: booking.client,
        assignedStaff: dayStaff.map(assignment => ({
          staffId: assignment.staff_id,
          staffName: assignment.staff_members?.name || 'Unknown',
          teamId: assignment.team_id,
          date: assignment.assignment_date
        })),
        rigDate: rigEvent ? format(new Date(rigEvent.start_time), 'yyyy-MM-dd') : undefined,
        rigTime: rigEvent ? format(new Date(rigEvent.start_time), 'HH:mm') : undefined,
        eventDate: eventEvent ? format(new Date(eventEvent.start_time), 'yyyy-MM-dd') : undefined,
        eventTime: eventEvent ? format(new Date(eventEvent.start_time), 'HH:mm') : undefined,
        rigDownDate: rigDownEvent ? format(new Date(rigDownEvent.start_time), 'yyyy-MM-dd') : undefined,
        rigDownTime: rigDownEvent ? format(new Date(rigDownEvent.start_time), 'HH:mm') : undefined,
        internalNotes: booking.internalnotes,
        status: booking.status,
        teamId: dayTeams[0],
        teamName: `Team ${dayTeams[0]}`
      });
    }
  }

  // Sort by date
  return scheduleData.sort((a, b) => {
    const dateA = a.rigDate || a.eventDate || a.rigDownDate || '';
    const dateB = b.rigDate || b.eventDate || b.rigDownDate || '';
    return dateA.localeCompare(dateB);
  });
};
