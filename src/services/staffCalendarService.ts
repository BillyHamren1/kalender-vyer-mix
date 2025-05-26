
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
  staffName?: string; // Added staff name for display
  bookingId?: string;
  eventType: 'assignment' | 'booking_event';
  backgroundColor?: string;
  borderColor?: string;
  client?: string; // Added client name for filtering
}

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

// Get calendar events for selected staff members within a date range
export const getStaffCalendarEvents = async (
  staffIds: string[], 
  startDate: Date, 
  endDate: Date
): Promise<StaffCalendarEvent[]> => {
  try {
    if (staffIds.length === 0) {
      return [];
    }

    console.log(`Fetching calendar events for staff: ${staffIds.join(', ')} from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);

    const events: StaffCalendarEvent[] = [];

    // Get staff assignments for the date range
    const assignments = await fetchStaffAssignmentsForDateRange(startDate, endDate);
    
    // Get all staff members to get their names
    const allStaff = await fetchStaffMembers();
    const staffMap = new Map(allStaff.map(staff => [staff.id, staff.name]));
    
    // Filter assignments for selected staff
    const filteredAssignments = assignments.filter(assignment => 
      staffIds.includes(assignment.staffId)
    );

    console.log(`Found ${filteredAssignments.length} assignments for selected staff`);

    // Get team calendar events for the assigned teams and dates
    for (const assignment of filteredAssignments) {
      const staffName = staffMap.get(assignment.staffId) || `Staff ${assignment.staffId}`;
      
      console.log(`Processing assignment for ${staffName} on ${assignment.date}, team ${assignment.teamId}`);

      // Fetch calendar events for this team on this specific date
      const { data: teamEvents, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('resource_id', assignment.teamId)
        .gte('start_time', `${assignment.date}T00:00:00`)
        .lt('start_time', `${assignment.date}T23:59:59`);

      if (error) {
        console.error(`Error fetching team events for ${assignment.teamId} on ${assignment.date}:`, error);
        continue;
      }

      console.log(`Found ${teamEvents?.length || 0} team events for ${assignment.teamId} on ${assignment.date}`);

      if (teamEvents && teamEvents.length > 0) {
        // Convert team calendar events to staff calendar events
        for (const teamEvent of teamEvents) {
          console.log(`Adding team event: ${teamEvent.title} for staff ${staffName}`);
          
          events.push({
            id: `staff-${assignment.staffId}-event-${teamEvent.id}`,
            title: teamEvent.title,
            start: teamEvent.start_time,
            end: teamEvent.end_time,
            resourceId: assignment.staffId,
            teamId: assignment.teamId,
            bookingId: teamEvent.booking_id,
            staffName: staffName,
            client: extractClientFromTitle(teamEvent.title),
            eventType: 'booking_event',
            backgroundColor: getEventColor(teamEvent.event_type || 'event'),
            borderColor: getEventBorderColor(teamEvent.event_type || 'event')
          });
        }
      } else {
        // Only create assignment event if no team events exist for this date
        console.log(`No team events found for ${assignment.teamId} on ${assignment.date}, creating assignment event`);
        
        events.push({
          id: `assignment-${assignment.staffId}-${assignment.date}`,
          title: `${staffName} (Team ${assignment.teamId})`,
          start: `${assignment.date}T08:00:00`,
          end: `${assignment.date}T17:00:00`,
          resourceId: assignment.staffId,
          teamId: assignment.teamId,
          teamName: assignment.teamName,
          staffName: staffName,
          eventType: 'assignment',
          backgroundColor: '#e3f2fd',
          borderColor: '#1976d2'
        });
      }
    }

    console.log(`Generated ${events.length} calendar events for staff view:`);
    events.forEach(event => {
      console.log(`- Event: ${event.title}, Date: ${event.start}, Type: ${event.eventType}, Client: ${event.client || 'N/A'}`);
    });
    
    return events;
  } catch (error) {
    console.error('Error fetching staff calendar events:', error);
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
      return '#fff3e0'; // Orange
    case 'event':
      return '#fff9c4'; // Yellow
    case 'rigDown':
      return '#f3e5f5'; // Purple
    default:
      return '#e8f5e8'; // Green
  }
};

const getEventBorderColor = (eventType: string): string => {
  switch (eventType) {
    case 'rig':
      return '#ff9800';
    case 'event':
      return '#ffeb3b';
    case 'rigDown':
      return '#9c27b0';
    default:
      return '#4caf50';
  }
};

// Get staff assignment summary for a specific date
export const getStaffSummaryForDate = async (
  staffIds: string[], 
  date: Date
): Promise<{ staffId: string; teamId?: string; teamName?: string; bookingsCount: number }[]> => {
  try {
    const dateStr = format(date, 'yyyy-MM-dd');
    const endDate = new Date(date);
    
    const assignments = await fetchStaffAssignmentsForDateRange(date, endDate);
    
    return staffIds.map(staffId => {
      const assignment = assignments.find(a => a.staffId === staffId && a.date === dateStr);
      return {
        staffId,
        teamId: assignment?.teamId,
        teamName: assignment?.teamName,
        bookingsCount: assignment?.bookings?.length || 0
      };
    });
  } catch (error) {
    console.error('Error fetching staff summary:', error);
    throw error;
  }
};
