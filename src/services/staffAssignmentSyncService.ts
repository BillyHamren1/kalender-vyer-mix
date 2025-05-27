
import { supabase } from "@/integrations/supabase/client";

// Service to synchronize staff assignments with calendar events
export class StaffAssignmentSyncService {
  // Team mapping function
  private static mapTeamId(teamId: string): string {
    const teamMapping: { [key: string]: string } = {
      'a': 'team-1',
      'b': 'team-2', 
      'c': 'team-3',
      'd': 'team-4',
      'e': 'team-5',
      'f': 'team-6'
    };
    
    return teamMapping[teamId] || teamId;
  }

  // Check and create missing staff assignments for calendar events
  static async syncStaffAssignments(): Promise<void> {
    try {
      console.log('Starting staff assignment synchronization...');
      
      // Get all calendar events with booking IDs
      const { data: calendarEvents, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .not('booking_id', 'is', null);

      if (eventsError) {
        console.error('Error fetching calendar events:', eventsError);
        return;
      }

      if (!calendarEvents || calendarEvents.length === 0) {
        console.log('No calendar events found');
        return;
      }

      // Get all existing staff assignments
      const { data: existingAssignments, error: assignmentsError } = await supabase
        .from('staff_assignments')
        .select('*');

      if (assignmentsError) {
        console.error('Error fetching existing assignments:', assignmentsError);
        return;
      }

      // Get all staff members
      const { data: staffMembers, error: staffError } = await supabase
        .from('staff_members')
        .select('*');

      if (staffError) {
        console.error('Error fetching staff members:', staffError);
        return;
      }

      if (!staffMembers || staffMembers.length === 0) {
        console.log('No staff members found');
        return;
      }

      // Create a set of existing assignment keys for quick lookup
      const existingAssignmentKeys = new Set(
        (existingAssignments || []).map(
          assignment => `${assignment.staff_id}_${assignment.team_id}_${assignment.assignment_date}`
        )
      );

      // Process each calendar event
      const missingAssignments: Array<{
        staff_id: string;
        team_id: string;
        assignment_date: string;
      }> = [];

      for (const event of calendarEvents) {
        const eventDate = new Date(event.start_time).toISOString().split('T')[0];
        const mappedTeamId = this.mapTeamId(event.resource_id);

        // Check if we have staff assignments for this team and date
        const hasAssignments = (existingAssignments || []).some(
          assignment => 
            (assignment.team_id === event.resource_id || assignment.team_id === mappedTeamId) &&
            assignment.assignment_date === eventDate
        );

        if (!hasAssignments) {
          console.log(`Missing staff assignments for team ${event.resource_id}/${mappedTeamId} on ${eventDate}`);
          
          // Create assignments for available staff members (limit to 2-3 per team)
          const availableStaff = staffMembers.slice(0, Math.min(3, staffMembers.length));
          
          for (const staff of availableStaff) {
            const assignmentKey = `${staff.id}_${mappedTeamId}_${eventDate}`;
            
            if (!existingAssignmentKeys.has(assignmentKey)) {
              missingAssignments.push({
                staff_id: staff.id,
                team_id: mappedTeamId,
                assignment_date: eventDate
              });
              
              // Add to existing keys to avoid duplicates
              existingAssignmentKeys.add(assignmentKey);
            }
          }
        }
      }

      // Insert missing assignments
      if (missingAssignments.length > 0) {
        console.log(`Creating ${missingAssignments.length} missing staff assignments`);
        
        const { error: insertError } = await supabase
          .from('staff_assignments')
          .insert(missingAssignments);

        if (insertError) {
          console.error('Error creating missing assignments:', insertError);
        } else {
          console.log('Successfully created missing staff assignments');
        }
      } else {
        console.log('No missing staff assignments found');
      }

    } catch (error) {
      console.error('Error in staff assignment sync:', error);
    }
  }

  // Debug function to check staff assignment coverage
  static async debugStaffAssignments(): Promise<void> {
    try {
      console.log('=== Staff Assignment Debug ===');
      
      // Get calendar events
      const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .not('booking_id', 'is', null);

      // Get staff assignments
      const { data: assignments } = await supabase
        .from('staff_assignments')
        .select('*');

      // Get staff members
      const { data: staff } = await supabase
        .from('staff_members')
        .select('*');

      console.log('Calendar events:', events?.length || 0);
      console.log('Staff assignments:', assignments?.length || 0);
      console.log('Staff members:', staff?.length || 0);

      // Check coverage
      const eventDates = new Set(
        (events || []).map(event => new Date(event.start_time).toISOString().split('T')[0])
      );

      const assignmentDates = new Set(
        (assignments || []).map(assignment => assignment.assignment_date)
      );

      console.log('Event dates:', Array.from(eventDates));
      console.log('Assignment dates:', Array.from(assignmentDates));

      const missingDates = Array.from(eventDates).filter(date => !assignmentDates.has(date));
      console.log('Missing staff assignment dates:', missingDates);

    } catch (error) {
      console.error('Error in debug:', error);
    }
  }
}
