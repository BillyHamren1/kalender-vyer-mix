
import { supabase } from "@/integrations/supabase/client";
import { JobsListItem, JobsListFilters } from "@/types/jobsList";
import { format } from "date-fns";

// Fetch all jobs with their calendar events and staff assignments
export const fetchJobsList = async (filters?: JobsListFilters): Promise<JobsListItem[]> => {
  console.log('Fetching jobs list with filters:', filters);
  
  // First, fetch all bookings
  let bookingsQuery = supabase
    .from('bookings')
    .select('*')
    .order('eventdate', { ascending: true });
  
  // Apply filters to bookings query
  if (filters?.status) {
    bookingsQuery = bookingsQuery.ilike('status', filters.status);
  }
  
  if (filters?.search) {
    bookingsQuery = bookingsQuery.or(`id.ilike.%${filters.search}%,client.ilike.%${filters.search}%`);
  }
  
  if (filters?.dateFrom) {
    bookingsQuery = bookingsQuery.gte('eventdate', filters.dateFrom);
  }
  
  if (filters?.dateTo) {
    bookingsQuery = bookingsQuery.lte('eventdate', filters.dateTo);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    throw bookingsError;
  }

  if (!bookings || bookings.length === 0) {
    console.log('No bookings found');
    return [];
  }

  console.log(`Found ${bookings.length} bookings`);

  // Fetch all calendar events for these bookings
  const bookingIds = bookings.map(booking => booking.id);
  const { data: calendarEvents, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .in('booking_id', bookingIds);

  if (eventsError) {
    console.error('Error fetching calendar events:', eventsError);
    throw eventsError;
  }

  console.log(`Found ${calendarEvents?.length || 0} calendar events`);

  // Fetch all staff assignments for the teams involved
  const teamIds = [...new Set(calendarEvents?.map(event => event.resource_id) || [])];
  const eventDates = [...new Set(calendarEvents?.map(event => {
    const date = new Date(event.start_time);
    return date.toISOString().split('T')[0];
  }) || [])];

  console.log('Team IDs:', teamIds);
  console.log('Event dates:', eventDates);

  let staffAssignments: any[] = [];
  if (teamIds.length > 0 && eventDates.length > 0) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('staff_assignments')
      .select('*')
      .in('team_id', teamIds)
      .in('assignment_date', eventDates);

    if (assignmentsError) {
      console.error('Error fetching staff assignments:', assignmentsError);
    } else {
      staffAssignments = assignments || [];
      console.log(`Found ${staffAssignments.length} staff assignments:`, staffAssignments);
    }
  }

  // Fetch staff member details
  const staffIds = [...new Set(staffAssignments.map(assignment => assignment.staff_id))];
  console.log('Staff IDs to fetch:', staffIds);
  
  let staffMembers: any[] = [];
  if (staffIds.length > 0) {
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .in('id', staffIds);

    if (staffError) {
      console.error('Error fetching staff members:', staffError);
    } else {
      staffMembers = staff || [];
      console.log(`Found ${staffMembers.length} staff members:`, staffMembers);
    }
  }

  // Process and combine the data
  const jobsList: JobsListItem[] = bookings.map(booking => {
    const bookingEvents = calendarEvents?.filter(event => event.booking_id === booking.id) || [];
    
    console.log(`Processing booking ${booking.id} with ${bookingEvents.length} events`);
    
    // Group events by type
    const rigEvents = bookingEvents.filter(event => event.event_type === 'rig');
    const eventEvents = bookingEvents.filter(event => event.event_type === 'event');
    const rigDownEvents = bookingEvents.filter(event => event.event_type === 'rigDown');

    // Helper function to get staff for a team on a specific date
    const getStaffForTeamAndDate = (teamId: string, date: string): string[] => {
      const dateAssignments = staffAssignments.filter(assignment => 
        assignment.team_id === teamId && assignment.assignment_date === date
      );
      
      console.log(`Getting staff for team ${teamId} on ${date}: found ${dateAssignments.length} assignments`);
      
      const staffNames = dateAssignments.map(assignment => {
        const staff = staffMembers.find(member => member.id === assignment.staff_id);
        const name = staff ? staff.name : 'Unknown Staff';
        console.log(`Staff assignment ${assignment.staff_id} -> ${name}`);
        return name;
      });
      
      return staffNames;
    };

    // Helper function to format event data
    const formatEventData = (events: any[]) => {
      if (events.length === 0) return { date: undefined, time: undefined, team: undefined, staff: [] };
      
      const event = events[0]; // Take the first event if multiple
      const eventDate = new Date(event.start_time);
      const eventDateStr = eventDate.toISOString().split('T')[0];
      
      const staffList = getStaffForTeamAndDate(event.resource_id, eventDateStr);
      console.log(`Event ${event.id} staff list:`, staffList);
      
      return {
        date: format(eventDate, 'MMM d, yyyy'),
        time: `${format(eventDate, 'HH:mm')} - ${format(new Date(event.end_time), 'HH:mm')}`,
        team: event.resource_id,
        staff: staffList
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
      viewed: booking.viewed
    };
    
    console.log(`Processed job ${booking.id}:`, {
      rigStaff: jobItem.rigStaff,
      eventStaff: jobItem.eventStaff,
      rigDownStaff: jobItem.rigDownStaff
    });
    
    return jobItem;
  });

  // Apply team filter if specified
  if (filters?.team) {
    return jobsList.filter(job => 
      job.rigTeam === filters.team || 
      job.eventTeam === filters.team || 
      job.rigDownTeam === filters.team
    );
  }

  console.log(`Returning ${jobsList.length} jobs`);
  return jobsList;
};

// Get unique teams from calendar events
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
