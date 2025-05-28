import { supabase } from "@/integrations/supabase/client";
import { fetchStaffAssignmentsForDateRange, StaffAssignmentResponse } from "./staffAssignmentService";
import { fetchStaffMembers, StaffMember } from "./staffService";
import { format } from "date-fns";

export interface StaffResource {
  id: string;
  title: string;
  name: string;
  email?: string;
}

export interface StaffCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  resourceId: string; // staff member ID
  teamId?: string;
  teamName?: string;
  staffName?: string;
  bookingId?: string;
  eventType: 'assignment' | 'booking_event';
  backgroundColor?: string;
  borderColor?: string;
  client?: string;
  extendedProps?: {
    bookingId?: string;
    booking_id?: string;
    deliveryAddress?: string;
    bookingNumber?: string;
    eventType?: string;
    staffName?: string;
    client?: string;
    teamName?: string;
  };
}

export interface BookingStaffAssignment {
  id: string;
  booking_id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  created_at: string;
  updated_at: string;
}

export interface BookingMoveResult {
  affected_staff: string[];
  conflicts: Array<{
    staff_id: string;
    reason: string;
    old_team: string;
    new_team: string;
    date: string;
  }>;
  success: boolean;
}

// Cache for staff members to avoid repeated API calls
let staffMembersCache: { data: StaffMember[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get all available staff members as calendar resources
export const getStaffResources = async (): Promise<StaffResource[]> => {
  try {
    const staffMembers = await fetchStaffMembers();
    
    return staffMembers.map(staff => ({
      id: staff.id,
      title: staff.name,
      name: staff.name,
      email: staff.email
    }));
  } catch (error) {
    console.error('Error fetching staff resources:', error);
    throw error;
  }
};

// Get booking-staff assignments for a date range
export const getBookingStaffAssignments = async (
  startDate: Date,
  endDate: Date
): Promise<BookingStaffAssignment[]> => {
  try {
    const { data, error } = await supabase
      .from('booking_staff_assignments')
      .select('*')
      .gte('assignment_date', format(startDate, 'yyyy-MM-dd'))
      .lte('assignment_date', format(endDate, 'yyyy-MM-dd'));

    if (error) {
      console.error('Error fetching booking staff assignments:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getBookingStaffAssignments:', error);
    throw error;
  }
};

// Optimized function to get staff members with caching
const getCachedStaffMembers = async (): Promise<StaffMember[]> => {
  const now = Date.now();
  
  if (staffMembersCache && (now - staffMembersCache.timestamp) < CACHE_DURATION) {
    return staffMembersCache.data;
  }
  
  const staffMembers = await fetchStaffMembers();
  staffMembersCache = { data: staffMembers, timestamp: now };
  
  return staffMembers;
};

// Get calendar events for selected staff members within a date range - FOCUS ON BOOKINGS ONLY
export const getStaffCalendarEvents = async (
  staffIds: string[], 
  startDate: Date, 
  endDate: Date
): Promise<StaffCalendarEvent[]> => {
  try {
    if (staffIds.length === 0) {
      return [];
    }

    console.log(`Fetching booking events only for staff: ${staffIds.join(', ')} from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);

    const events: StaffCalendarEvent[] = [];

    // Use cached staff members to improve performance
    const allStaff = await getCachedStaffMembers();
    const staffMap = new Map(allStaff.map(staff => [staff.id, staff.name]));

    // Get booking-staff assignments for the date range and selected staff
    const bookingStaffAssignments = await getBookingStaffAssignments(startDate, endDate);
    const filteredBookingAssignments = bookingStaffAssignments.filter(assignment =>
      staffIds.includes(assignment.staff_id)
    );

    console.log(`Found ${filteredBookingAssignments.length} booking-staff assignments`);

    // Process booking assignments (these are the actual work assignments)
    for (const bookingAssignment of filteredBookingAssignments) {
      const staffName = staffMap.get(bookingAssignment.staff_id) || `Staff ${bookingAssignment.staff_id}`;
      
      // Get the booking details to get proper client name
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('client')
        .eq('id', bookingAssignment.booking_id)
        .single();

      if (bookingError) {
        console.error(`Error fetching booking ${bookingAssignment.booking_id}:`, bookingError);
        continue;
      }

      // Get the calendar events for this booking
      const { data: calendarEvents, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('booking_id', bookingAssignment.booking_id)
        .eq('resource_id', bookingAssignment.team_id)
        .gte('start_time', `${bookingAssignment.assignment_date}T00:00:00`)
        .lt('start_time', `${bookingAssignment.assignment_date}T23:59:59`);

      if (error) {
        console.error(`Error fetching calendar events for booking ${bookingAssignment.booking_id}:`, error);
        continue;
      }

      if (calendarEvents && calendarEvents.length > 0) {
        for (const calendarEvent of calendarEvents) {
          const clientName = booking?.client || 'Unknown Client';
          const eventType = calendarEvent.event_type || 'event';
          
          console.log(`Adding booking event: ${clientName} - ${eventType} for staff ${staffName} with booking ID: ${bookingAssignment.booking_id}`);
          
          events.push({
            id: `staff-${bookingAssignment.staff_id}-booking-${calendarEvent.id}`,
            title: `${clientName} - ${eventType}`,
            start: calendarEvent.start_time,
            end: calendarEvent.end_time,
            resourceId: bookingAssignment.staff_id,
            teamId: bookingAssignment.team_id,
            bookingId: bookingAssignment.booking_id,
            staffName: staffName,
            client: clientName,
            eventType: 'booking_event',
            backgroundColor: getEventColor(eventType),
            borderColor: getEventBorderColor(eventType),
            extendedProps: {
              bookingId: bookingAssignment.booking_id,
              booking_id: bookingAssignment.booking_id,
              deliveryAddress: calendarEvent.delivery_address,
              bookingNumber: calendarEvent.booking_number,
              eventType: eventType,
              staffName: staffName,
              client: clientName,
              teamName: `Team ${bookingAssignment.team_id}`
            }
          });
        }
      }
    }

    console.log(`Generated ${events.length} booking calendar events for staff view:`);
    events.forEach(event => {
      console.log(`- Event: ${event.title}, Date: ${event.start}, Type: ${event.extendedProps?.eventType}, Staff: ${event.staffName}, Booking ID: ${event.bookingId || 'N/A'}`);
    });
    
    return events;
  } catch (error) {
    console.error('Error fetching staff calendar events:', error);
    throw error;
  }
};

// Handle booking moves and staff reassignments
export const handleBookingMove = async (
  bookingId: string,
  oldTeamId: string,
  newTeamId: string,
  oldDate: string,
  newDate: string
): Promise<BookingMoveResult> => {
  try {
    console.log(`Handling booking move: ${bookingId} from team ${oldTeamId} (${oldDate}) to team ${newTeamId} (${newDate})`);

    const { data, error } = await supabase.rpc('handle_booking_move', {
      p_booking_id: bookingId,
      p_old_team_id: oldTeamId,
      p_new_team_id: newTeamId,
      p_old_date: oldDate,
      p_new_date: newDate
    });

    if (error) {
      console.error('Error handling booking move:', error);
      throw error;
    }

    return data as unknown as BookingMoveResult;
  } catch (error) {
    console.error('Error in handleBookingMove:', error);
    throw error;
  }
};

// Get staff assignments for a specific booking
export const getStaffForBooking = async (bookingId: string, date: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .eq('booking_id', bookingId)
      .eq('assignment_date', date);

    if (error) {
      console.error('Error fetching staff for booking:', error);
      throw error;
    }

    return data?.map(assignment => assignment.staff_id) || [];
  } catch (error) {
    console.error('Error in getStaffForBooking:', error);
    throw error;
  }
};

// Manually assign staff to a booking
export const assignStaffToBooking = async (
  bookingId: string,
  staffId: string,
  teamId: string,
  date: string
): Promise<void> => {
  try {
    console.log(`Manually assigning staff ${staffId} to booking ${bookingId} on ${date}`);

    // Check if staff is assigned to the team on that date
    const { data: staffAssignment, error: staffError } = await supabase
      .from('staff_assignments')
      .select('*')
      .eq('staff_id', staffId)
      .eq('team_id', teamId)
      .eq('assignment_date', date)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staffAssignment) {
      throw new Error(`Staff ${staffId} is not assigned to team ${teamId} on ${date}`);
    }

    // Insert the booking-staff assignment
    const { error: insertError } = await supabase
      .from('booking_staff_assignments')
      .insert({
        booking_id: bookingId,
        staff_id: staffId,
        team_id: teamId,
        assignment_date: date
      });

    if (insertError) {
      throw insertError;
    }

    console.log('Staff manually assigned to booking successfully');
  } catch (error) {
    console.error('Error in assignStaffToBooking:', error);
    throw error;
  }
};

// Remove staff from a booking
export const removeStaffFromBooking = async (
  bookingId: string,
  staffId: string,
  date: string
): Promise<void> => {
  try {
    console.log(`Removing staff ${staffId} from booking ${bookingId} on ${date}`);

    const { error } = await supabase
      .from('booking_staff_assignments')
      .delete()
      .eq('booking_id', bookingId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);

    if (error) {
      throw error;
    }

    console.log('Staff removed from booking successfully');
  } catch (error) {
    console.error('Error in removeStaffFromBooking:', error);
    throw error;
  }
};

// Helper function to extract client name from event title
const extractClientFromTitle = (title: string): string | undefined => {
  // Try to extract client name from common title formats
  // e.g., "#2025-123 - John Doe" -> "John Doe"
  const clientMatch = title.match(/^#?[\d\-]+\s*-\s*(.+)$/);
  if (clientMatch) {
    return clientMatch[1].trim();
  }
  
  // If no pattern matches, return the title as is (might be the client name)
  return title;
};

// Get event colors based on event type
const getEventColor = (eventType: string): string => {
  switch (eventType) {
    case 'rig':
      return '#fff3e0'; // Light orange
    case 'event':
      return '#fff9c4'; // Light yellow
    case 'rigDown':
      return '#f3e5f5'; // Light purple
    default:
      return '#e8f5e8'; // Light green
  }
};

const getEventBorderColor = (eventType: string): string => {
  switch (eventType) {
    case 'rig':
      return '#ff9800'; // Orange
    case 'event':
      return '#ffeb3b'; // Yellow
    case 'rigDown':
      return '#9c27b0'; // Purple
    default:
      return '#4caf50'; // Green
  }
};

// Get staff assignment summary for a specific date (updated to use booking assignments)
export const getStaffSummaryForDate = async (
  staffIds: string[], 
  date: Date
): Promise<{ staffId: string; teamId?: string; teamName?: string; bookingsCount: number }[]> => {
  try {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Get team assignments
    const assignments = await fetchStaffAssignmentsForDateRange(date, date);
    
    // Get booking assignments
    const bookingAssignments = await getBookingStaffAssignments(date, date);
    
    return staffIds.map(staffId => {
      const assignment = assignments.find(a => a.staffId === staffId && a.date === dateStr);
      const bookingCount = bookingAssignments.filter(ba => 
        ba.staff_id === staffId && ba.assignment_date === dateStr
      ).length;
      
      return {
        staffId,
        teamId: assignment?.teamId,
        teamName: assignment?.teamName,
        bookingsCount: bookingCount
      };
    });
  } catch (error) {
    console.error('Error fetching staff summary:', error);
    throw error;
  }
};
