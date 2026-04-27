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
    largeProjectId?: string;
    largeProjectName?: string;
    consolidatedBookingIds?: string[];
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

interface LargeProjectStaffAssignment {
  large_project_id: string;
  staff_id: string;
  role?: string;
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

// Get calendar events for selected staff members within a date range
// Includes both normal booking assignments and large-project memberships.
export const getStaffCalendarEvents = async (
  staffIds: string[], 
  startDate: Date, 
  endDate: Date
): Promise<StaffCalendarEvent[]> => {
  try {
    if (staffIds.length === 0) {
      return [];
    }

    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    console.log(`Fetching staff calendar events for staff: ${staffIds.join(', ')} from ${startDateStr} to ${endDateStr}`);

    const events: StaffCalendarEvent[] = [];

    const allStaff = await getCachedStaffMembers();
    const staffMap = new Map(allStaff.map(staff => [staff.id, staff.name]));

    // =========================
    // 1) NORMAL BOOKING EVENTS
    // =========================
    const bookingStaffAssignments = await getBookingStaffAssignments(startDate, endDate);
    const filteredBookingAssignments = bookingStaffAssignments.filter(assignment =>
      staffIds.includes(assignment.staff_id)
    );

    const bookingIds = [...new Set(filteredBookingAssignments.map(a => a.booking_id))];
    const bookingMap = new Map<string, any>();

    if (bookingIds.length > 0) {
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('id, client, booking_number, large_project_id')
        .in('id', bookingIds);

      if (bookingError) {
        console.error('Error fetching bookings for staff calendar:', bookingError);
      } else {
        (bookings || []).forEach((booking: any) => bookingMap.set(booking.id, booking));
      }
    }

    // Important: large project bookings are rendered through large_project_staff below,
    // so we skip them here to avoid duplicates and disappearing consolidated rows.
    const normalBookingIds = bookingIds.filter(bookingId => !bookingMap.get(bookingId)?.large_project_id);
    const bookingEventMap = new Map<string, any[]>();

    if (normalBookingIds.length > 0) {
      const { data: calendarEvents, error } = await supabase
        .from('calendar_events')
        .select('id, booking_id, start_time, end_time, event_type, resource_id, booking_number, delivery_address, source_date')
        .in('booking_id', normalBookingIds)
        .gte('start_time', `${startDateStr}T00:00:00`)
        .lt('start_time', `${endDateStr}T23:59:59`);

      if (error) {
        console.error('Error fetching normal booking calendar events:', error);
      } else {
        for (const calendarEvent of calendarEvents || []) {
          const eventDate = calendarEvent.source_date || calendarEvent.start_time?.split('T')[0] || '';
          const key = `${calendarEvent.booking_id}|${calendarEvent.resource_id}|${eventDate}`;
          if (!bookingEventMap.has(key)) bookingEventMap.set(key, []);
          bookingEventMap.get(key)!.push(calendarEvent);
        }
      }
    }

    for (const bookingAssignment of filteredBookingAssignments) {
      const booking = bookingMap.get(bookingAssignment.booking_id);
      if (booking?.large_project_id) continue;

      const staffName = staffMap.get(bookingAssignment.staff_id) || `Staff ${bookingAssignment.staff_id}`;
      const clientName = booking?.client || 'Unknown Client';
      const key = `${bookingAssignment.booking_id}|${bookingAssignment.team_id}|${bookingAssignment.assignment_date}`;
      const calendarEvents = bookingEventMap.get(key) || [];

      for (const calendarEvent of calendarEvents) {
        const eventType = calendarEvent.event_type || 'event';
        events.push({
          id: `staff-${bookingAssignment.staff_id}-booking-${calendarEvent.id}`,
          title: `${clientName} - ${eventType}`,
          start: calendarEvent.start_time,
          end: calendarEvent.end_time,
          resourceId: bookingAssignment.staff_id,
          teamId: bookingAssignment.team_id,
          bookingId: bookingAssignment.booking_id,
          staffName,
          client: clientName,
          eventType: 'booking_event',
          backgroundColor: getEventColor(eventType),
          borderColor: getEventBorderColor(eventType),
          extendedProps: {
            bookingId: bookingAssignment.booking_id,
            booking_id: bookingAssignment.booking_id,
            deliveryAddress: calendarEvent.delivery_address,
            bookingNumber: calendarEvent.booking_number || booking?.booking_number,
            eventType,
            staffName,
            client: clientName,
            teamName: `Team ${bookingAssignment.team_id}`
          }
        });
      }
    }

    // ======================
    // 2) LARGE PROJECT EVENTS
    // ======================
    const { data: largeProjectAssignments, error: lpAssignmentError } = await supabase
      .from('large_project_staff')
      .select('large_project_id, staff_id, role')
      .in('staff_id', staffIds);

    if (lpAssignmentError) {
      console.error('Error fetching large project staff assignments:', lpAssignmentError);
    }

    const filteredLargeProjectAssignments = (largeProjectAssignments || []) as LargeProjectStaffAssignment[];
    const largeProjectIds = [...new Set(filteredLargeProjectAssignments.map(a => a.large_project_id))];

    if (largeProjectIds.length > 0) {
      const [{ data: largeProjects, error: lpError }, { data: largeProjectBookings, error: lpbError }] = await Promise.all([
        supabase
          .from('large_projects')
          .select('id, name, address, start_date, event_date, end_date, deleted_at')
          .in('id', largeProjectIds)
          .is('deleted_at', null),
        supabase
          .from('large_project_bookings')
          .select('large_project_id, booking_id')
          .in('large_project_id', largeProjectIds),
      ]);

      if (lpError) {
        console.error('Error fetching large projects for staff calendar:', lpError);
      }
      if (lpbError) {
        console.error('Error fetching large project bookings for staff calendar:', lpbError);
      }

      const projectMap = new Map((largeProjects || []).map((project: any) => [project.id, project]));
      const bookingToLargeProjectId = new Map<string, string>();
      const bookingsByLargeProjectId = new Map<string, string[]>();

      for (const row of largeProjectBookings || []) {
        bookingToLargeProjectId.set(row.booking_id, row.large_project_id);
        if (!bookingsByLargeProjectId.has(row.large_project_id)) bookingsByLargeProjectId.set(row.large_project_id, []);
        bookingsByLargeProjectId.get(row.large_project_id)!.push(row.booking_id);
      }

      const linkedBookingIds = [...new Set((largeProjectBookings || []).map(row => row.booking_id))];
      const eventsByLargeProjectId = new Map<string, any[]>();

      if (linkedBookingIds.length > 0) {
        const { data: linkedCalendarEvents, error: lpCalendarError } = await supabase
          .from('calendar_events')
          .select('id, booking_id, start_time, end_time, event_type, resource_id, booking_number, delivery_address, source_date')
          .in('booking_id', linkedBookingIds)
          .gte('start_time', `${startDateStr}T00:00:00`)
          .lt('start_time', `${endDateStr}T23:59:59`);

        if (lpCalendarError) {
          console.error('Error fetching large project calendar events:', lpCalendarError);
        } else {
          for (const calendarEvent of linkedCalendarEvents || []) {
            const lpId = bookingToLargeProjectId.get(calendarEvent.booking_id);
            if (!lpId) continue;
            if (!eventsByLargeProjectId.has(lpId)) eventsByLargeProjectId.set(lpId, []);
            eventsByLargeProjectId.get(lpId)!.push(calendarEvent);
          }
        }
      }

      const consolidatedLargeProjectEvents = new Map<string, StaffCalendarEvent>();

      for (const assignment of filteredLargeProjectAssignments) {
        const staffName = staffMap.get(assignment.staff_id) || `Staff ${assignment.staff_id}`;
        const project = projectMap.get(assignment.large_project_id);
        if (!project) continue;

        const projectName = project.name || 'Stort projekt';
        const projectAddress = project.address || undefined;
        const linkedEvents = eventsByLargeProjectId.get(assignment.large_project_id) || [];

        // Preferred path: use the linked booking calendar events and consolidate them
        // to ONE row per project/day/type for each staff member.
        for (const calendarEvent of linkedEvents) {
          const eventType = calendarEvent.event_type || 'event';
          const eventDate = calendarEvent.source_date || calendarEvent.start_time?.split('T')[0] || '';
          const key = `${assignment.staff_id}|${assignment.large_project_id}|${eventType}|${eventDate}`;
          const firstBookingId = calendarEvent.booking_id;
          const existing = consolidatedLargeProjectEvents.get(key);

          if (!existing) {
            consolidatedLargeProjectEvents.set(key, {
              id: `staff-${assignment.staff_id}-large-${assignment.large_project_id}-${eventType}-${eventDate}`,
              title: `${projectName} - ${eventType}`,
              start: calendarEvent.start_time,
              end: calendarEvent.end_time,
              resourceId: assignment.staff_id,
              teamId: calendarEvent.resource_id,
              bookingId: firstBookingId,
              staffName,
              client: projectName,
              eventType: 'booking_event',
              backgroundColor: getEventColor(eventType),
              borderColor: getEventBorderColor(eventType),
              extendedProps: {
                bookingId: firstBookingId,
                booking_id: firstBookingId,
                deliveryAddress: calendarEvent.delivery_address || projectAddress,
                bookingNumber: calendarEvent.booking_number,
                eventType,
                staffName,
                client: projectName,
                teamName: calendarEvent.resource_id ? `Team ${calendarEvent.resource_id}` : undefined,
                largeProjectId: assignment.large_project_id,
                largeProjectName: projectName,
                consolidatedBookingIds: firstBookingId ? [firstBookingId] : []
              }
            });
            continue;
          }

          if (calendarEvent.start_time < existing.start) existing.start = calendarEvent.start_time;
          if (calendarEvent.end_time > existing.end) existing.end = calendarEvent.end_time;

          const consolidatedIds = existing.extendedProps?.consolidatedBookingIds || [];
          if (firstBookingId && !consolidatedIds.includes(firstBookingId)) {
            consolidatedIds.push(firstBookingId);
          }
          if (existing.extendedProps) {
            existing.extendedProps.consolidatedBookingIds = consolidatedIds;
          }
        }

        // Fallback path: if a large project temporarily lacks sub-booking calendar_events,
        // still render its project-level dates so it doesn't vanish from the staff calendar.
        if (linkedEvents.length === 0) {
          const fallbackDates: Array<{ date: string; eventType: 'rig' | 'event' | 'rigDown' }> = [
            ...((project.start_date || []).map((date: string) => ({ date, eventType: 'rig' as const }))),
            ...((project.event_date || []).map((date: string) => ({ date, eventType: 'event' as const }))),
            ...((project.end_date || []).map((date: string) => ({ date, eventType: 'rigDown' as const }))),
          ].filter(item => item.date >= startDateStr && item.date <= endDateStr);

          const fallbackBookingId = bookingsByLargeProjectId.get(assignment.large_project_id)?.[0];
          for (const fallback of fallbackDates) {
            const key = `${assignment.staff_id}|${assignment.large_project_id}|${fallback.eventType}|${fallback.date}`;
            if (consolidatedLargeProjectEvents.has(key)) continue;

            consolidatedLargeProjectEvents.set(key, {
              id: `staff-${assignment.staff_id}-large-${assignment.large_project_id}-${fallback.eventType}-${fallback.date}`,
              title: `${projectName} - ${fallback.eventType}`,
              start: `${fallback.date}T08:00:00`,
              end: `${fallback.date}T12:00:00`,
              resourceId: assignment.staff_id,
              bookingId: fallbackBookingId,
              staffName,
              client: projectName,
              eventType: 'booking_event',
              backgroundColor: getEventColor(fallback.eventType),
              borderColor: getEventBorderColor(fallback.eventType),
              extendedProps: {
                bookingId: fallbackBookingId,
                booking_id: fallbackBookingId,
                deliveryAddress: projectAddress,
                eventType: fallback.eventType,
                staffName,
                client: projectName,
                largeProjectId: assignment.large_project_id,
                largeProjectName: projectName,
                consolidatedBookingIds: fallbackBookingId ? [fallbackBookingId] : []
              }
            });
          }
        }
      }

      events.push(...consolidatedLargeProjectEvents.values());
    }

    console.log(`Generated ${events.length} staff calendar events`);
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

// Get event colors based on event type - Updated to match staff calendar requirements
const getEventColor = (eventType: string): string => {
  switch (eventType) {
    case 'rig':
      return '#F2FCE2'; // Light green
    case 'event':
      return '#FEF7CD'; // Yellow
    case 'rigDown':
      return '#FFDEE2'; // Light red
    case 'activity':
      return '#DBEAFE'; // Light blue (synced project activities)
    default:
      return '#e8f5e8'; // Light green fallback
  }
};

const getEventBorderColor = (eventType: string): string => {
  switch (eventType) {
    case 'rig':
      return '#D4EAB5'; // Light green border
    case 'event':
      return '#F3E8A3'; // Yellow border
    case 'rigDown':
      return '#FEB190'; // Light red border
    case 'activity':
      return '#93C5FD'; // Light blue border
    default:
      return '#4caf50'; // Green fallback
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
