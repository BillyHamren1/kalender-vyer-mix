
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";

// Interface for the complete staff assignment response
export interface StaffAssignmentResponse {
  staffId: string;
  date: string;
  teamId: string;
  teamName?: string;
  bookings: StaffBooking[];
  eventsCount: number;
  summary?: StaffSummary;
  bookingAssignments?: BookingAssignmentInfo[]; // New: direct booking assignments
}

// Enhanced booking interface with events
export interface StaffBooking extends Booking {
  events: BookingEvent[];
  teamId: string;
  coordinates?: {
    latitude: number | null;
    longitude: number | null;
  };
  isDirectlyAssigned?: boolean; // New: indicates if staff is directly assigned to this booking
}

// Interface for booking events
export interface BookingEvent {
  id: string;
  type: 'rig' | 'event' | 'rigDown';
  start: string;
  end: string;
  title: string;
}

// New interface for booking assignment information
export interface BookingAssignmentInfo {
  booking_id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  booking_details?: any;
}

// New summary interface for quick overview of assignments
export interface StaffSummary {
  totalBookings: number;
  directlyAssignedBookings: number; // New: bookings directly assigned
  teamBookings: number; // New: bookings through team assignment
  eventsByType: {
    rig: number;
    event: number;
    rigDown: number;
  };
  firstEventTime?: string;
  lastEventTime?: string;
  locationCoordinates?: {
    latitude: number | null;
    longitude: number | null;
  }[];
}

// Helper function to get the staff API key
const getStaffApiKey = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('get-api-key', {
      body: { key_type: 'staff' }
    });
    
    if (error) throw error;
    return data.apiKey;
  } catch (error) {
    console.error('Error getting staff API key:', error);
    throw error;
  }
};

// Fetch a staff member's assignments and bookings for a specific date (updated to include direct booking assignments)
export const fetchStaffAssignment = async (staffId: string, date: Date): Promise<StaffAssignmentResponse> => {
  try {
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`Fetching enhanced staff assignment for ${staffId} on ${formattedDate}`);

    // Get team assignment
    const { data: teamAssignment, error: teamError } = await supabase
      .from('staff_assignments')
      .select('team_id')
      .eq('staff_id', staffId)
      .eq('assignment_date', formattedDate)
      .maybeSingle();

    if (teamError) {
      console.error('Error fetching team assignment:', teamError);
      throw teamError;
    }

    // Get direct booking assignments
    const { data: bookingAssignments, error: bookingError } = await supabase
      .from('booking_staff_assignments')
      .select(`
        booking_id,
        staff_id,
        team_id,
        assignment_date
      `)
      .eq('staff_id', staffId)
      .eq('assignment_date', formattedDate);

    if (bookingError) {
      console.error('Error fetching booking assignments:', bookingError);
      throw bookingError;
    }

    const directBookingIds = bookingAssignments?.map(ba => ba.booking_id) || [];
    
    // If no team assignment and no direct bookings, return empty response
    if (!teamAssignment && directBookingIds.length === 0) {
      return {
        staffId,
        date: formattedDate,
        teamId: '',
        bookings: [],
        eventsCount: 0,
        bookingAssignments: [],
        summary: {
          totalBookings: 0,
          directlyAssignedBookings: 0,
          teamBookings: 0,
          eventsByType: { rig: 0, event: 0, rigDown: 0 }
        }
      };
    }

    const teamId = teamAssignment?.team_id || '';
    const allBookings: StaffBooking[] = [];
    let allEvents: BookingEvent[] = [];

    // Process direct booking assignments first
    if (directBookingIds.length > 0) {
      console.log(`Processing ${directBookingIds.length} direct booking assignments`);
      
      // Get booking details
      const { data: directBookings, error: directBookingsError } = await supabase
        .from('bookings')
        .select('*')
        .in('id', directBookingIds);

      if (directBookingsError) {
        console.error('Error fetching direct bookings:', directBookingsError);
      } else {
        // Get events for these bookings
        const { data: directEvents, error: directEventsError } = await supabase
          .from('calendar_events')
          .select('*')
          .in('booking_id', directBookingIds)
          .gte('start_time', `${formattedDate}T00:00:00`)
          .lt('start_time', `${formattedDate}T23:59:59`);

        if (directEventsError) {
          console.error('Error fetching direct booking events:', directEventsError);
        }

        // Process direct bookings
        for (const booking of directBookings || []) {
          const bookingEvents = (directEvents || [])
            .filter(event => event.booking_id === booking.id)
            .map(event => ({
              id: event.id,
              type: event.event_type as 'rig' | 'event' | 'rigDown',
              start: event.start_time,
              end: event.end_time,
              title: event.title
            }));

          const bookingAssignment = bookingAssignments?.find(ba => ba.booking_id === booking.id);
          
          allBookings.push({
            ...booking,
            teamId: bookingAssignment?.team_id || teamId,
            events: bookingEvents,
            isDirectlyAssigned: true,
            coordinates: {
              latitude: booking.delivery_latitude,
              longitude: booking.delivery_longitude
            }
          });

          allEvents = allEvents.concat(bookingEvents);
        }
      }
    }

    // If staff has team assignment, get team-based bookings (excluding directly assigned ones)
    if (teamId) {
      console.log(`Processing team assignment for team ${teamId}`);
      
      // Get all events for the team on the specified date (excluding directly assigned bookings)
      const { data: teamEvents, error: teamEventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('resource_id', teamId)
        .gte('start_time', `${formattedDate}T00:00:00`)
        .lt('start_time', `${formattedDate}T23:59:59`)
        .not('booking_id', 'in', directBookingIds.length > 0 ? `(${directBookingIds.map(id => `'${id}'`).join(',')})` : '()');

      if (teamEventsError) {
        console.error('Error fetching team events:', teamEventsError);
      } else {
        // Group team events by booking
        const teamBookingIds = [...new Set((teamEvents || [])
          .filter(event => event.booking_id)
          .map(event => event.booking_id))];

        if (teamBookingIds.length > 0) {
          // Fetch team booking details
          const { data: teamBookings, error: teamBookingsError } = await supabase
            .from('bookings')
            .select('*')
            .in('id', teamBookingIds);

          if (teamBookingsError) {
            console.error('Error fetching team bookings:', teamBookingsError);
          } else {
            // Process team bookings
            for (const booking of teamBookings || []) {
              const bookingEvents = (teamEvents || [])
                .filter(event => event.booking_id === booking.id)
                .map(event => ({
                  id: event.id,
                  type: event.event_type as 'rig' | 'event' | 'rigDown',
                  start: event.start_time,
                  end: event.end_time,
                  title: event.title
                }));

              allBookings.push({
                ...booking,
                teamId,
                events: bookingEvents,
                isDirectlyAssigned: false,
                coordinates: {
                  latitude: booking.delivery_latitude,
                  longitude: booking.delivery_longitude
                }
              });

              allEvents = allEvents.concat(bookingEvents);
            }
          }
        }
      }
    }

    // Calculate enhanced summary stats
    const eventsByType = {
      rig: allEvents.filter(e => e.type === 'rig').length,
      event: allEvents.filter(e => e.type === 'event').length,
      rigDown: allEvents.filter(e => e.type === 'rigDown').length
    };

    // Sort events chronologically to find first and last
    const sortedEvents = [...allEvents].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime());

    const summary: StaffSummary = {
      totalBookings: allBookings.length,
      directlyAssignedBookings: allBookings.filter(b => b.isDirectlyAssigned).length,
      teamBookings: allBookings.filter(b => !b.isDirectlyAssigned).length,
      eventsByType,
      firstEventTime: sortedEvents.length > 0 ? sortedEvents[0].start : undefined,
      lastEventTime: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].end : undefined,
      locationCoordinates: allBookings
        .map(b => b.coordinates)
        .filter(c => c && (c.latitude || c.longitude))
    };

    console.log(`Enhanced staff assignment summary: ${summary.totalBookings} total bookings (${summary.directlyAssignedBookings} direct, ${summary.teamBookings} team)`);

    return {
      staffId,
      date: formattedDate,
      teamId,
      bookings: allBookings,
      eventsCount: allEvents.length,
      bookingAssignments: bookingAssignments || [],
      summary
    };
  } catch (error) {
    console.error('Error in fetchStaffAssignment:', error);
    throw error;
  }
};

// Get the scheduled jobs and details for the staff member's next work day
export const fetchNextWorkDay = async (staffId: string): Promise<StaffAssignmentResponse | null> => {
  try {
    const today = new Date();
    
    // Try to find the next 7 days of assignments
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date();
      checkDate.setDate(today.getDate() + i);
      
      try {
        const assignment = await fetchStaffAssignment(staffId, checkDate);
        if ((assignment.teamId && assignment.bookings.length > 0) || assignment.bookingAssignments?.length > 0) {
          return assignment;
        }
      } catch (error) {
        console.warn(`No assignments found for ${checkDate.toDateString()}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding next work day:', error);
    throw error;
  }
};

// New function to fetch all bookings for all staff members across all teams (updated for booking assignments)
export const fetchAllStaffBookings = async (date: Date): Promise<StaffBooking[]> => {
  try {
    const formattedDate = date.toISOString().split('T')[0];
    console.log(`Fetching all staff bookings for ${formattedDate} using new booking assignment system`);
    
    // Get all booking assignments for the date
    const { data: bookingAssignments, error: assignmentError } = await supabase
      .from('booking_staff_assignments')
      .select(`
        booking_id,
        staff_id,
        team_id,
        assignment_date
      `)
      .eq('assignment_date', formattedDate);

    if (assignmentError) {
      console.error('Error fetching booking assignments:', assignmentError);
      throw assignmentError;
    }

    if (!bookingAssignments || bookingAssignments.length === 0) {
      console.log('No booking assignments found for date');
      return [];
    }

    const bookingIds = [...new Set(bookingAssignments.map(ba => ba.booking_id))];
    
    // Get booking details
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .in('id', bookingIds);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    // Get events for these bookings
    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('booking_id', bookingIds)
      .gte('start_time', `${formattedDate}T00:00:00`)
      .lt('start_time', `${formattedDate}T23:59:59`);

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      throw eventsError;
    }

    // Process bookings with assignment info
    const processedBookings: StaffBooking[] = [];
    
    for (const booking of bookings || []) {
      const bookingEvents = (events || [])
        .filter(event => event.booking_id === booking.id)
        .map(event => ({
          id: event.id,
          type: event.event_type as 'rig' | 'event' | 'rigDown',
          start: event.start_time,
          end: event.end_time,
          title: event.title
        }));

      // Find team assignment for this booking (could be multiple staff)
      const assignment = bookingAssignments.find(ba => ba.booking_id === booking.id);
      
      processedBookings.push({
        ...booking,
        teamId: assignment?.team_id || '',
        events: bookingEvents,
        isDirectlyAssigned: true, // These are all from booking assignments
        coordinates: {
          latitude: booking.delivery_latitude,
          longitude: booking.delivery_longitude
        }
      });
    }

    console.log(`Processed ${processedBookings.length} staff bookings using booking assignment system`);
    return processedBookings;
  } catch (error) {
    console.error('Error in fetchAllStaffBookings:', error);
    throw error;
  }
};

// NEW: Fetch all staff assignments without date restriction
export const fetchAllStaffAssignments = async (): Promise<{
  staffId: string;
  staffName: string;
  assignments: {
    date: string;
    teamId: string;
    teamName: string;
  }[];
}[]> => {
  try {
    const apiKey = await getStaffApiKey();
    
    const { data, error } = await supabase.functions.invoke('staff-assignments', {
      body: {
        fetchAllAssignments: true
      },
      headers: {
        'x-api-key': apiKey
      }
    });
    
    if (error) {
      console.error('Error fetching all staff assignments:', error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in fetchAllStaffAssignments:', error);
    throw error;
  }
};

// NEW: Fetch assignments for a date range (enhanced with booking assignment info)
export const fetchStaffAssignmentsForDateRange = async (
  startDate: Date, 
  endDate: Date
): Promise<StaffAssignmentResponse[]> => {
  try {
    const apiKey = await getStaffApiKey();
    
    const { data, error } = await supabase.functions.invoke('staff-assignments', {
      body: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        fetchDateRange: true,
        includeBookingAssignments: true // New parameter for enhanced data
      },
      headers: {
        'x-api-key': apiKey
      }
    });
    
    if (error) {
      console.error('Error fetching staff assignments for date range:', error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in fetchStaffAssignmentsForDateRange:', error);
    throw error;
  }
};
