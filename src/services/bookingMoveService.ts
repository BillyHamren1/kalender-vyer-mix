
import { supabase } from "@/integrations/supabase/client";
import { BookingMoveResult, handleBookingMove } from "./staffCalendarService";
import { toast } from "sonner";

export interface BookingMoveConflict {
  staff_id: string;
  staff_name: string;
  reason: string;
  old_team: string;
  new_team: string;
  date: string;
}

export interface BookingMoveOptions {
  reassignStaff?: boolean;
  forceMove?: boolean;
  alternativeStaff?: string[];
}

// Handle a booking move with conflict resolution
export const processBookingMove = async (
  bookingId: string,
  oldTeamId: string,
  newTeamId: string,
  oldDate: string,
  newDate: string,
  options: BookingMoveOptions = {}
): Promise<{
  success: boolean;
  conflicts: BookingMoveConflict[];
  message: string;
}> => {
  try {
    console.log('Processing booking move with options:', options);

    // First, attempt the move
    const moveResult = await handleBookingMove(bookingId, oldTeamId, newTeamId, oldDate, newDate);

    if (moveResult.success) {
      return {
        success: true,
        conflicts: [],
        message: `Booking moved successfully. ${moveResult.affected_staff?.length || 0} staff members reassigned.`
      };
    }

    // If there are conflicts, we need to resolve them
    const conflicts = await enrichConflictInfo(moveResult.conflicts);

    if (options.forceMove) {
      // Force move by removing conflicted staff assignments
      await resolveConflictsByRemoval(bookingId, conflicts, newDate);
      return {
        success: true,
        conflicts,
        message: `Booking moved. Some staff could not be reassigned due to team conflicts.`
      };
    }

    if (options.alternativeStaff && options.alternativeStaff.length > 0) {
      // Try to assign alternative staff
      const assignmentResult = await assignAlternativeStaff(
        bookingId,
        newTeamId,
        newDate,
        options.alternativeStaff
      );
      
      return {
        success: assignmentResult.success,
        conflicts: assignmentResult.success ? [] : conflicts,
        message: assignmentResult.message
      };
    }

    // Return conflicts for user resolution
    return {
      success: false,
      conflicts,
      message: `Booking move has conflicts. ${conflicts.length} staff members cannot be reassigned to the new team/date.`
    };

  } catch (error) {
    console.error('Error processing booking move:', error);
    throw error;
  }
};

// Enrich conflict information with staff names
const enrichConflictInfo = async (conflicts: any[]): Promise<BookingMoveConflict[]> => {
  if (!conflicts || conflicts.length === 0) return [];

  const staffIds = conflicts.map(c => c.staff_id);
  
  // Get staff names
  const { data: staffMembers, error } = await supabase
    .from('staff_members')
    .select('id, name')
    .in('id', staffIds);

  if (error) {
    console.error('Error fetching staff names for conflicts:', error);
    return conflicts.map(c => ({
      ...c,
      staff_name: `Staff ${c.staff_id}`
    }));
  }

  const staffMap = new Map(staffMembers?.map(s => [s.id, s.name]) || []);

  return conflicts.map(conflict => ({
    ...conflict,
    staff_name: staffMap.get(conflict.staff_id) || `Staff ${conflict.staff_id}`
  }));
};

// Resolve conflicts by removing staff assignments that can't be moved
const resolveConflictsByRemoval = async (
  bookingId: string,
  conflicts: BookingMoveConflict[],
  newDate: string
): Promise<void> => {
  try {
    const conflictedStaffIds = conflicts.map(c => c.staff_id);
    
    // Remove the conflicted staff from the booking (they're already removed by the move function)
    // This is just for logging/notification purposes
    console.log(`Resolved conflicts by removing ${conflictedStaffIds.length} staff members from booking ${bookingId}`);
    
    if (conflictedStaffIds.length > 0) {
      toast.warning(
        `Some staff could not be moved with the booking`,
        {
          description: `${conflictedStaffIds.length} staff members were not reassigned due to team conflicts`
        }
      );
    }
  } catch (error) {
    console.error('Error resolving conflicts by removal:', error);
    throw error;
  }
};

// Assign alternative staff to the booking
const assignAlternativeStaff = async (
  bookingId: string,
  teamId: string,
  date: string,
  alternativeStaffIds: string[]
): Promise<{ success: boolean; message: string }> => {
  try {
    let successCount = 0;
    let errorCount = 0;

    for (const staffId of alternativeStaffIds) {
      try {
        // Check if staff is available on the team/date
        const { data: staffAssignment } = await supabase
          .from('staff_assignments')
          .select('*')
          .eq('staff_id', staffId)
          .eq('team_id', teamId)
          .eq('assignment_date', date)
          .maybeSingle();

        if (staffAssignment) {
          // Assign staff to booking
          const { error } = await supabase
            .from('booking_staff_assignments')
            .insert({
              booking_id: bookingId,
              staff_id: staffId,
              team_id: teamId,
              assignment_date: date
            });

          if (!error) {
            successCount++;
          } else {
            console.error(`Error assigning alternative staff ${staffId}:`, error);
            errorCount++;
          }
        } else {
          console.warn(`Alternative staff ${staffId} not available on team ${teamId} on ${date}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`Error processing alternative staff ${staffId}:`, error);
        errorCount++;
      }
    }

    return {
      success: successCount > 0,
      message: `Assigned ${successCount} alternative staff members${errorCount > 0 ? `, ${errorCount} failed` : ''}`
    };
  } catch (error) {
    console.error('Error assigning alternative staff:', error);
    throw error;
  }
};

// Get available staff for a team on a specific date (for conflict resolution)
export const getAvailableStaffForTeam = async (teamId: string, date: string): Promise<{
  id: string;
  name: string;
  alreadyAssigned: boolean;
}[]> => {
  try {
    // Get all staff assigned to the team on the date
    const { data: teamStaff, error: teamError } = await supabase
      .from('staff_assignments')
      .select(`
        staff_id,
        staff_members (
          id,
          name
        )
      `)
      .eq('team_id', teamId)
      .eq('assignment_date', date);

    if (teamError) throw teamError;

    // Get staff already assigned to bookings on this date
    const { data: busyStaff, error: busyError } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .eq('team_id', teamId)
      .eq('assignment_date', date);

    if (busyError) throw busyError;

    const busyStaffIds = new Set(busyStaff?.map(bs => bs.staff_id) || []);

    return (teamStaff || []).map(ts => ({
      id: ts.staff_id,
      name: ts.staff_members?.name || `Staff ${ts.staff_id}`,
      alreadyAssigned: busyStaffIds.has(ts.staff_id)
    }));
  } catch (error) {
    console.error('Error getting available staff for team:', error);
    throw error;
  }
};
