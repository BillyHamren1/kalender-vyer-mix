
import { supabase } from "@/integrations/supabase/client";
import { JobsListItem, JobsListFilters } from "@/types/jobsList";
import { format } from "date-fns";

// Simple team mapping for the SQL query
const getTeamMappingConditions = () => {
  return `
    (ce.resource_id = sa.team_id) OR 
    (ce.resource_id = 'a' AND sa.team_id = 'team-1') OR
    (ce.resource_id = 'b' AND sa.team_id = 'team-2') OR
    (ce.resource_id = 'c' AND sa.team_id = 'team-3') OR
    (ce.resource_id = 'd' AND sa.team_id = 'team-4') OR
    (ce.resource_id = 'e' AND sa.team_id = 'team-5') OR
    (ce.resource_id = 'f' AND sa.team_id = 'team-6') OR
    (ce.resource_id = 'team-1' AND sa.team_id = 'a') OR
    (ce.resource_id = 'team-2' AND sa.team_id = 'b') OR
    (ce.resource_id = 'team-3' AND sa.team_id = 'c') OR
    (ce.resource_id = 'team-4' AND sa.team_id = 'd') OR
    (ce.resource_id = 'team-5' AND sa.team_id = 'e') OR
    (ce.resource_id = 'team-6' AND sa.team_id = 'f')
  `;
};

export const fetchJobsList = async (filters?: JobsListFilters): Promise<JobsListItem[]> => {
  console.log('Fetching jobs list with simplified SQL approach, filters:', filters);
  
  try {
    // Build the base query with all JOINs
    let query = supabase
      .from('bookings')
      .select(`
        *,
        calendar_events!inner(
          id,
          event_type,
          start_time,
          end_time,
          resource_id,
          title
        )
      `)
      .not('calendar_events.booking_id', 'is', null)
      .order('eventdate', { ascending: true });

    // Apply filters to the main query
    if (filters?.status) {
      query = query.ilike('status', filters.status);
    }
    
    if (filters?.search) {
      query = query.or(`id.ilike.%${filters.search}%,client.ilike.%${filters.search}%,deliveryaddress.ilike.%${filters.search}%`);
    }
    
    if (filters?.dateFrom) {
      query = query.or(`rigdaydate.gte.${filters.dateFrom},eventdate.gte.${filters.dateFrom},rigdowndate.gte.${filters.dateFrom}`);
    }
    
    if (filters?.dateTo) {
      query = query.or(`rigdaydate.lte.${filters.dateTo},eventdate.lte.${filters.dateTo},rigdowndate.lte.${filters.dateTo}`);
    }

    const { data: bookingsWithEvents, error: bookingsError } = await query;

    if (bookingsError) {
      console.error('Error fetching bookings with events:', bookingsError);
      throw bookingsError;
    }

    if (!bookingsWithEvents || bookingsWithEvents.length === 0) {
      console.log('No bookings with calendar events found');
      return [];
    }

    console.log(`Found ${bookingsWithEvents.length} bookings with calendar events`);

    // Get all unique event dates and team IDs for staff lookup
    const allEventDates = new Set<string>();
    const allTeamIds = new Set<string>();

    bookingsWithEvents.forEach(booking => {
      if (booking.calendar_events) {
        booking.calendar_events.forEach((event: any) => {
          const eventDate = new Date(event.start_time).toISOString().split('T')[0];
          allEventDates.add(eventDate);
          allTeamIds.add(event.resource_id);
          
          // Add mapped team IDs
          if (event.resource_id === 'a') allTeamIds.add('team-1');
          if (event.resource_id === 'b') allTeamIds.add('team-2');
          if (event.resource_id === 'c') allTeamIds.add('team-3');
          if (event.resource_id === 'd') allTeamIds.add('team-4');
          if (event.resource_id === 'e') allTeamIds.add('team-5');
          if (event.resource_id === 'f') allTeamIds.add('team-6');
          if (event.resource_id === 'team-1') allTeamIds.add('a');
          if (event.resource_id === 'team-2') allTeamIds.add('b');
          if (event.resource_id === 'team-3') allTeamIds.add('c');
          if (event.resource_id === 'team-4') allTeamIds.add('d');
          if (event.resource_id === 'team-5') allTeamIds.add('e');
          if (event.resource_id === 'team-6') allTeamIds.add('f');
        });
      }
    });

    // Fetch all relevant staff assignments in one query
    const { data: staffAssignments, error: staffError } = await supabase
      .from('staff_assignments')
      .select(`
        *,
        staff_members(
          id,
          name
        )
      `)
      .in('team_id', Array.from(allTeamIds))
      .in('assignment_date', Array.from(allEventDates));

    if (staffError) {
      console.error('Error fetching staff assignments:', staffError);
    }

    const assignments = staffAssignments || [];
    console.log(`Found ${assignments.length} staff assignments`);

    // Helper function to get staff for a team and date
    const getStaffForTeamAndDate = (teamId: string, date: string): string[] => {
      const teamVariations = [
        teamId,
        teamId === 'a' ? 'team-1' : teamId === 'team-1' ? 'a' : null,
        teamId === 'b' ? 'team-2' : teamId === 'team-2' ? 'b' : null,
        teamId === 'c' ? 'team-3' : teamId === 'team-3' ? 'c' : null,
        teamId === 'd' ? 'team-4' : teamId === 'team-4' ? 'd' : null,
        teamId === 'e' ? 'team-5' : teamId === 'team-5' ? 'e' : null,
        teamId === 'f' ? 'team-6' : teamId === 'team-6' ? 'f' : null,
      ].filter(Boolean);

      const staffNames = assignments
        .filter(assignment => 
          teamVariations.includes(assignment.team_id) && 
          assignment.assignment_date === date &&
          assignment.staff_members
        )
        .map(assignment => assignment.staff_members.name)
        .filter(name => name);

      return staffNames;
    };

    // Process bookings into JobsListItems
    const jobsList: JobsListItem[] = bookingsWithEvents.map(booking => {
      const events = booking.calendar_events || [];
      
      // Group events by type
      const rigEvents = events.filter((event: any) => event.event_type === 'rig');
      const eventEvents = events.filter((event: any) => event.event_type === 'event');
      const rigDownEvents = events.filter((event: any) => event.event_type === 'rigDown');

      // Helper to format event data
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
        
        const event = events[0];
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

      return {
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        client: booking.client || 'Unknown Client',
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
        hasCalendarEvents: true,
        totalCalendarEvents: events.length
      };
    });

    // Apply team filter if specified
    if (filters?.team) {
      const teamVariations = [
        filters.team,
        filters.team === 'a' ? 'team-1' : filters.team === 'team-1' ? 'a' : null,
        filters.team === 'b' ? 'team-2' : filters.team === 'team-2' ? 'b' : null,
        filters.team === 'c' ? 'team-3' : filters.team === 'team-3' ? 'c' : null,
        filters.team === 'd' ? 'team-4' : filters.team === 'team-4' ? 'd' : null,
        filters.team === 'e' ? 'team-5' : filters.team === 'team-5' ? 'e' : null,
        filters.team === 'f' ? 'team-6' : filters.team === 'team-6' ? 'f' : null,
      ].filter(Boolean);
      
      const filteredJobs = jobsList.filter(job => 
        teamVariations.includes(job.rigTeam || '') || 
        teamVariations.includes(job.eventTeam || '') || 
        teamVariations.includes(job.rigDownTeam || '')
      );
      
      console.log(`Filtered jobs by team ${filters.team}: ${filteredJobs.length} jobs`);
      return filteredJobs;
    }

    console.log(`Returning ${jobsList.length} jobs (all with calendar events)`);
    return jobsList;

  } catch (error) {
    console.error('Error in fetchJobsList:', error);
    throw error;
  }
};

// Get unique teams from calendar events
export const getTeamsForFilter = async (): Promise<string[]> => {
  try {
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
  } catch (error) {
    console.error('Error in getTeamsForFilter:', error);
    return [];
  }
};

// Real-time updates subscription
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
