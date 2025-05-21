
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";

// Interface for the complete staff assignment response
export interface StaffAssignmentResponse {
  staffId: string;
  date: string;
  teamId: string;
  teamName?: string; // Added human-readable team name
  bookings: StaffBooking[];
  eventsCount: number;
  summary?: StaffSummary; // Added summary information
}

// Enhanced booking interface with events
export interface StaffBooking extends Booking {
  events: BookingEvent[];
  teamId: string;
  coordinates?: {
    latitude: number | null;
    longitude: number | null;
  };
}

// Interface for booking events
export interface BookingEvent {
  id: string;
  type: 'rig' | 'event' | 'rigDown';
  start: string;
  end: string;
  title: string;
}

// New summary interface for quick overview of assignments
export interface StaffSummary {
  totalBookings: number;
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

// Fetch a staff member's assignments and bookings for a specific date
export const fetchStaffAssignment = async (staffId: string, date: Date): Promise<StaffAssignmentResponse> => {
  try {
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { data, error } = await supabase.functions.invoke('staff-assignments', {
      body: {
        staffId,
        date: formattedDate
      }
    });
    
    if (error) {
      console.error('Error fetching staff assignment:', error);
      throw error;
    }
    
    return data as StaffAssignmentResponse;
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
        if (assignment.teamId && assignment.bookings.length > 0) {
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
