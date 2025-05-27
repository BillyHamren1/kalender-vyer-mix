
import { supabase } from "@/integrations/supabase/client";
import { JobsListItem, JobsListFilters } from "@/types/jobsList";
import { format } from "date-fns";

// Enhanced team mapping function that handles both directions
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

// Helper function to get all team variations for a given team ID
const getTeamVariations = (teamId: string): string[] => {
  const mapping: { [key: string]: string[] } = {
    'a': ['a', 'team-1'],
    'team-1': ['a', 'team-1'],
    'b': ['b', 'team-2'],
    'team-2': ['b', 'team-2'],
    'c': ['c', 'team-3'],
    'team-3': ['c', 'team-3'],
    'd': ['d', 'team-4'],
    'team-4': ['d', 'team-4'],
    'e': ['e', 'team-5'],
    'team-5': ['e', 'team-5'],
    'f': ['f', 'team-6'],
    'team-6': ['f', 'team-6']
  };
  
  return mapping[teamId] || [teamId];
};

export const fetchJobsList = async (filters?: JobsListFilters): Promise<JobsListItem[]> => {
  console.log('Fetching jobs list with enhanced multi-team support, filters:', filters);
  
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
          
          // Add both the original team ID and all its variations
          const teamVariations = getTeamVariations(event.resource_id);
          teamVariations.forEach(teamId => allTeamIds.add(teamId));
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

    // Helper function to get staff for all team variations and date
    const getStaffForTeamsAndDate = (teamIds: string[], date: string): string[] => {
      const allTeamVariations = teamIds.flatMap(teamId => getTeamVariations(teamId));
      
      const staffNames = assignments
        .filter(assignment => 
          allTeamVariations.includes(assignment.team_id) && 
          assignment.assignment_date === date &&
          assignment.staff_members
        )
        .map(assignment => assignment.staff_members.name)
        .filter(name => name);

      return [...new Set(staffNames)]; // Remove duplicates
    };

    // Helper function to get all teams for a given event type
    const getTeamsForEventType = (events: any[], eventType: string): string[] => {
      return [...new Set(
        events
          .filter(event => event.event_type === eventType)
          .map(event => event.resource_id)
      )];
    };

    // Process bookings into JobsListItems
    const jobsList: JobsListItem[] = bookingsWithEvents.map(booking => {
      const events = booking.calendar_events || [];
      
      // Group events by type and get all teams for each type
      const rigEvents = events.filter((event: any) => event.event_type === 'rig');
      const eventEvents = events.filter((event: any) => event.event_type === 'event');
      const rigDownEvents = events.filter((event: any) => event.event_type === 'rigDown');

      // Helper to format event data for multiple teams
      const formatEventDataWithMultipleTeams = (typeEvents: any[]) => {
        if (typeEvents.length === 0) {
          return { 
            date: undefined, 
            time: undefined, 
            teams: [], 
            staff: [],
            hasCalendarEvent: false
          };
        }
        
        // Get all unique teams for this event type
        const teams = getTeamsForEventType(typeEvents, typeEvents[0].event_type);
        
        // Use the first event for date/time (they should all be on the same date)
        const firstEvent = typeEvents[0];
        const eventDate = new Date(firstEvent.start_time);
        const eventDateStr = eventDate.toISOString().split('T')[0];
        
        // Get staff from all teams
        const staffList = getStaffForTeamsAndDate(teams, eventDateStr);
        
        return {
          date: format(eventDate, 'MMM d, yyyy'),
          time: `${format(eventDate, 'HH:mm')} - ${format(new Date(firstEvent.end_time), 'HH:mm')}`,
          teams: teams,
          staff: staffList,
          hasCalendarEvent: true
        };
      };

      const rigData = formatEventDataWithMultipleTeams(rigEvents);
      const eventData = formatEventDataWithMultipleTeams(eventEvents);
      const rigDownData = formatEventDataWithMultipleTeams(rigDownEvents);

      return {
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        client: booking.client || 'Unknown Client',
        status: booking.status || 'PENDING',
        rigDate: rigData.date,
        rigTime: rigData.time,
        rigTeams: rigData.teams, // Changed to teams (plural)
        rigStaff: rigData.staff,
        eventDate: eventData.date,
        eventTime: eventData.time,
        eventTeams: eventData.teams, // Changed to teams (plural)
        eventStaff: eventData.staff,
        rigDownDate: rigDownData.date,
        rigDownTime: rigDownData.time,
        rigDownTeams: rigDownData.teams, // Changed to teams (plural)
        rigDownStaff: rigDownData.staff,
        deliveryAddress: booking.deliveryaddress,
        deliveryCity: booking.delivery_city,
        viewed: booking.viewed,
        hasCalendarEvents: true,
        totalCalendarEvents: events.length
      };
    });

    // Apply team filter if specified (check against all team variations)
    if (filters?.team) {
      const teamVariations = getTeamVariations(filters.team);
      
      const filteredJobs = jobsList.filter(job => 
        (job.rigTeams && job.rigTeams.some(team => teamVariations.includes(team))) ||
        (job.eventTeams && job.eventTeams.some(team => teamVariations.includes(team))) ||
        (job.rigDownTeams && job.rigDownTeams.some(team => teamVariations.includes(team)))
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
