import { supabase } from "@/integrations/supabase/client";
import { JobsListItem, JobsListFilters } from "@/types/jobsList";
import { format } from "date-fns";

// Team mapping function to convert single letters to team-X format
const mapTeamId = (teamId: string): string => {
  const teamMapping: { [key: string]: string } = {
    'a': 'team-1',
    'b': 'team-2', 
    'c': 'team-3',
    'd': 'team-4',
    'e': 'team-5',
    'f': 'team-6'
  };
  
  return teamMapping[teamId] || teamId;
};

// Enhanced fetch function to get ONLY bookings with calendar events
export const fetchJobsList = async (filters?: JobsListFilters): Promise<JobsListItem[]> => {
  console.log('Fetching jobs list with calendar events only, filters:', filters);
  
  // First, get all calendar events with booking IDs
  const { data: calendarEvents, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .not('booking_id', 'is', null);

  if (eventsError) {
    console.error('Error fetching calendar events:', eventsError);
    throw eventsError;
  }

  if (!calendarEvents || calendarEvents.length === 0) {
    console.log('No calendar events with booking IDs found');
    return [];
  }

  // Get unique booking IDs from calendar events
  const bookingIdsWithEvents = [...new Set(calendarEvents.map(event => event.booking_id))];
  console.log(`Found ${bookingIdsWithEvents.length} unique bookings with calendar events`);

  // Build the bookings query with filters, only for bookings that have calendar events
  let bookingsQuery = supabase
    .from('bookings')
    .select('*')
    .in('id', bookingIdsWithEvents)
    .order('eventdate', { ascending: true });
  
  // Apply filters to bookings query
  if (filters?.status) {
    bookingsQuery = bookingsQuery.ilike('status', filters.status);
  }
  
  if (filters?.search) {
    bookingsQuery = bookingsQuery.or(`id.ilike.%${filters.search}%,client.ilike.%${filters.search}%,deliveryaddress.ilike.%${filters.search}%`);
  }
  
  if (filters?.dateFrom) {
    bookingsQuery = bookingsQuery.or(`rigdaydate.gte.${filters.dateFrom},eventdate.gte.${filters.dateFrom},rigdowndate.gte.${filters.dateFrom}`);
  }
  
  if (filters?.dateTo) {
    bookingsQuery = bookingsQuery.or(`rigdaydate.lte.${filters.dateTo},eventdate.lte.${filters.dateTo},rigdowndate.lte.${filters.dateTo}`);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    throw bookingsError;
  }

  if (!bookings || bookings.length === 0) {
    console.log('No bookings found with calendar events');
    return [];
  }

  console.log(`Found ${bookings.length} bookings with calendar events`);

  // Get unique team IDs and dates for staff assignment lookup
  const allTeamIds = [...new Set(calendarEvents?.map(event => event.resource_id) || [])];
  const mappedTeamIds = [...new Set(allTeamIds.map(mapTeamId))];
  
  const allEventDates = [...new Set(calendarEvents?.map(event => {
    const date = new Date(event.start_time);
    return date.toISOString().split('T')[0];
  }) || [])];

  console.log('All Team IDs:', allTeamIds);
  console.log('Mapped Team IDs:', mappedTeamIds);
  console.log('All Event dates:', allEventDates.length, 'unique dates');

  // Fetch all staff assignments for better performance
  let staffAssignments: any[] = [];
  if (mappedTeamIds.length > 0 && allEventDates.length > 0) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('staff_assignments')
      .select('*')
      .in('team_id', mappedTeamIds)
      .in('assignment_date', allEventDates);

    if (assignmentsError) {
      console.error('Error fetching staff assignments:', assignmentsError);
    } else {
      staffAssignments = assignments || [];
      console.log(`Found ${staffAssignments.length} staff assignments`);
    }
  }

  // Fetch all staff member details
  const allStaffIds = [...new Set(staffAssignments.map(assignment => assignment.staff_id))];
  console.log('All Staff IDs to fetch:', allStaffIds.length);
  
  let staffMembers: any[] = [];
  if (allStaffIds.length > 0) {
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .in('id', allStaffIds);

    if (staffError) {
      console.error('Error fetching staff members:', staffError);
    } else {
      staffMembers = staff || [];
      console.log(`Found ${staffMembers.length} staff members`);
    }
  }

  // Process and combine the data for bookings with calendar events only
  const jobsList: JobsListItem[] = bookings.map(booking => {
    // Find calendar events for this booking
    const bookingEvents = calendarEvents?.filter(event => event.booking_id === booking.id) || [];
    
    console.log(`Processing booking ${booking.id} with ${bookingEvents.length} events`);
    
    // Group events by type
    const rigEvents = bookingEvents.filter(event => event.event_type === 'rig');
    const eventEvents = bookingEvents.filter(event => event.event_type === 'event');
    const rigDownEvents = bookingEvents.filter(event => event.event_type === 'rigDown');

    // Helper function to get staff for a team on a specific date with mapping
    const getStaffForTeamAndDate = (teamId: string, date: string): string[] => {
      if (!teamId || !date) return [];
      
      const mappedTeamId = mapTeamId(teamId);
      
      const dateAssignments = staffAssignments.filter(assignment => 
        assignment.team_id === mappedTeamId && assignment.assignment_date === date
      );
      
      const staffNames = dateAssignments.map(assignment => {
        const staff = staffMembers.find(member => member.id === assignment.staff_id);
        return staff ? staff.name : `Staff-${assignment.staff_id}`;
      });
      
      return staffNames;
    };

    // Helper function to format event data
    const formatEventData = (events: any[]) => {
      if (events.length === 0) {
        return { 
          date: undefined, 
          time: undefined, 
          team: undefined, 
          staff: [],
          hasCalendarEvent: false
        };
      }
      
      const event = events[0]; // Take the first event if multiple
      const eventDate = new Date(event.start_time);
      const eventDateStr = eventDate.toISOString().split('T')[0];
      
      const staffList = getStaffForTeamAndDate(event.resource_id, eventDateStr);
      
      return {
        date: format(eventDate, 'MMM d, yyyy'),
        time: `${format(eventDate, 'HH:mm')} - ${format(new Date(event.end_time), 'HH:mm')}`,
        team: event.resource_id,
        staff: staffList,
        hasCalendarEvent: true
      };
    };

    const rigData = formatEventData(rigEvents);
    const eventData = formatEventData(eventEvents);
    const rigDownData = formatEventData(rigDownEvents);

    const jobItem = {
      bookingId: booking.id,
      client: booking.client,
      status: booking.status || 'PENDING',
      rigDate: rigData.date,
      rigTime: rigData.time,
      rigTeam: rigData.team,
      rigStaff: rigData.staff,
      eventDate: eventData.date,
      eventTime: eventData.time,
      eventTeam: eventData.team,
      eventStaff: eventData.staff,
      rigDownDate: rigDownData.date,
      rigDownTime: rigDownData.time,
      rigDownTeam: rigDownData.team,
      rigDownStaff: rigDownData.staff,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      viewed: booking.viewed,
      // These will always be true since we only fetch bookings with calendar events
      hasCalendarEvents: true,
      totalCalendarEvents: bookingEvents.length
    };
    
    return jobItem;
  });

  // Apply team filter if specified (handle both original and mapped team IDs)
  if (filters?.team) {
    return jobsList.filter(job => {
      const mappedFilterTeam = mapTeamId(filters.team);
      return job.rigTeam === filters.team || 
             job.eventTeam === filters.team || 
             job.rigDownTeam === filters.team ||
             mapTeamId(job.rigTeam || '') === mappedFilterTeam ||
             mapTeamId(job.eventTeam || '') === mappedFilterTeam ||
             mapTeamId(job.rigDownTeam || '') === mappedFilterTeam;
    });
  }

  console.log(`Returning ${jobsList.length} jobs (all with calendar events)`);
  return jobsList;
};

// Get unique teams from calendar events (enhanced)
export const getTeamsForFilter = async (): Promise<string[]> => {
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .not('resource_id', 'is', null);

  if (error) {
    console.error('Error fetching teams:', error);
    return [];
  }

  const uniqueTeams = [...new Set(events?.map(event => event.resource_id) || [])];
  return uniqueTeams.sort();
};

// New function to get real-time updates
export const subscribeToJobsListUpdates = (callback: () => void) => {
  const bookingsChannel = supabase
    .channel('jobs_list_bookings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, callback)
    .subscribe();

  const eventsChannel = supabase
    .channel('jobs_list_events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, callback)
    .subscribe();

  const staffChannel = supabase
    .channel('jobs_list_staff')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_assignments' }, callback)
    .subscribe();

  return () => {
    supabase.removeChannel(bookingsChannel);
    supabase.removeChannel(eventsChannel);
    supabase.removeChannel(staffChannel);
  };
};
