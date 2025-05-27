
import { supabase } from "@/integrations/supabase/client";

// Service to synchronize staff assignments with calendar events
export class StaffAssignmentSyncService {
  // Team mapping function - handles both directions
  private static mapTeamId(teamId: string): string[] {
    const teamMapping: { [key: string]: string[] } = {
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
    
    return teamMapping[teamId] || [teamId];
  }

  // Sync staff assignments when calendar events change
  static async syncCalendarEventStaffAssignments(eventId: string): Promise<void> {
    try {
      console.log(`Syncing staff assignments for calendar event: ${eventId}`);
      
      // Get the calendar event details
      const { data: event, error: eventError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) {
        console.error('Error fetching calendar event:', eventError);
        return;
      }

      if (!event || !event.booking_id) {
        console.log('Event has no booking_id, skipping staff sync');
        return;
      }

      const eventDate = new Date(event.start_time).toISOString().split('T')[0];
      const teamVariations = this.mapTeamId(event.resource_id);

      // Remove old staff assignments for this booking and date
      const { error: deleteError } = await supabase
        .from('booking_staff_assignments')
        .delete()
        .eq('booking_id', event.booking_id)
        .eq('assignment_date', eventDate);

      if (deleteError) {
        console.error('Error removing old staff assignments:', deleteError);
        return;
      }

      // Get all calendar events for this booking on this date to get all teams
      const { data: allEventsOnDate, error: allEventsError } = await supabase
        .from('calendar_events')
        .select('resource_id')
        .eq('booking_id', event.booking_id)
        .gte('start_time', `${eventDate}T00:00:00`)
        .lt('start_time', `${eventDate}T23:59:59`);

      if (allEventsError) {
        console.error('Error fetching all events for date:', allEventsError);
        return;
      }

      // Get all unique teams working on this date
      const allTeamsOnDate = new Set<string>();
      allEventsOnDate?.forEach(evt => {
        const variations = this.mapTeamId(evt.resource_id);
        variations.forEach(variation => allTeamsOnDate.add(variation));
      });

      // Get staff assignments for all teams on this date
      const { data: staffAssignments, error: staffError } = await supabase
        .from('staff_assignments')
        .select('staff_id, team_id')
        .in('team_id', Array.from(allTeamsOnDate))
        .eq('assignment_date', eventDate);

      if (staffError) {
        console.error('Error fetching staff assignments:', staffError);
        return;
      }

      // Create booking staff assignments
      const bookingStaffAssignments = staffAssignments?.map(assignment => ({
        booking_id: event.booking_id,
        staff_id: assignment.staff_id,
        team_id: assignment.team_id,
        assignment_date: eventDate
      })) || [];

      if (bookingStaffAssignments.length > 0) {
        const { error: insertError } = await supabase
          .from('booking_staff_assignments')
          .insert(bookingStaffAssignments);

        if (insertError) {
          console.error('Error creating booking staff assignments:', insertError);
        } else {
          console.log(`Created ${bookingStaffAssignments.length} booking staff assignments`);
        }
      }

    } catch (error) {
      console.error('Error in syncCalendarEventStaffAssignments:', error);
    }
  }

  // Sync all staff assignments for a specific booking across all dates
  static async syncBookingStaffAssignments(bookingId: string): Promise<void> {
    try {
      console.log(`Syncing all staff assignments for booking: ${bookingId}`);
      
      // Get all calendar events for this booking
      const { data: events, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('booking_id', bookingId);

      if (eventsError) {
        console.error('Error fetching calendar events:', eventsError);
        return;
      }

      if (!events || events.length === 0) {
        console.log('No calendar events found for booking');
        return;
      }

      // Remove all existing staff assignments for this booking
      const { error: deleteError } = await supabase
        .from('booking_staff_assignments')
        .delete()
        .eq('booking_id', bookingId);

      if (deleteError) {
        console.error('Error removing old booking staff assignments:', deleteError);
        return;
      }

      // Group events by date
      const eventsByDate = new Map<string, any[]>();
      events.forEach(event => {
        const eventDate = new Date(event.start_time).toISOString().split('T')[0];
        if (!eventsByDate.has(eventDate)) {
          eventsByDate.set(eventDate, []);
        }
        eventsByDate.get(eventDate)!.push(event);
      });

      // Process each date
      for (const [eventDate, dateEvents] of eventsByDate) {
        // Get all unique teams for this date
        const allTeamsOnDate = new Set<string>();
        dateEvents.forEach(event => {
          const variations = this.mapTeamId(event.resource_id);
          variations.forEach(variation => allTeamsOnDate.add(variation));
        });

        // Get staff assignments for all teams on this date
        const { data: staffAssignments, error: staffError } = await supabase
          .from('staff_assignments')
          .select('staff_id, team_id')
          .in('team_id', Array.from(allTeamsOnDate))
          .eq('assignment_date', eventDate);

        if (staffError) {
          console.error('Error fetching staff assignments for date:', eventDate, staffError);
          continue;
        }

        // Create booking staff assignments for this date
        const bookingStaffAssignments = staffAssignments?.map(assignment => ({
          booking_id: bookingId,
          staff_id: assignment.staff_id,
          team_id: assignment.team_id,
          assignment_date: eventDate
        })) || [];

        if (bookingStaffAssignments.length > 0) {
          const { error: insertError } = await supabase
            .from('booking_staff_assignments')
            .insert(bookingStaffAssignments);

          if (insertError) {
            console.error('Error creating booking staff assignments for date:', eventDate, insertError);
          } else {
            console.log(`Created ${bookingStaffAssignments.length} booking staff assignments for ${eventDate}`);
          }
        }
      }

    } catch (error) {
      console.error('Error in syncBookingStaffAssignments:', error);
    }
  }

  // Check and create missing staff assignments for calendar events
  static async syncStaffAssignments(): Promise<void> {
    try {
      console.log('Starting comprehensive staff assignment synchronization...');
      
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

      // Group events by booking and date
      const bookingDateMap = new Map<string, Set<string>>();
      calendarEvents.forEach(event => {
        const eventDate = new Date(event.start_time).toISOString().split('T')[0];
        const key = `${event.booking_id}-${eventDate}`;
        
        if (!bookingDateMap.has(key)) {
          bookingDateMap.set(key, new Set());
        }
        
        const teamVariations = this.mapTeamId(event.resource_id);
        teamVariations.forEach(teamId => bookingDateMap.get(key)!.add(teamId));
      });

      // Get all existing booking staff assignments
      const { data: existingAssignments, error: assignmentsError } = await supabase
        .from('booking_staff_assignments')
        .select('*');

      if (assignmentsError) {
        console.error('Error fetching existing assignments:', assignmentsError);
        return;
      }

      // Create a set of existing assignment keys for quick lookup
      const existingKeys = new Set(
        (existingAssignments || []).map(
          assignment => `${assignment.booking_id}-${assignment.assignment_date}-${assignment.team_id}-${assignment.staff_id}`
        )
      );

      // Get all staff assignments
      const { data: staffAssignments, error: staffError } = await supabase
        .from('staff_assignments')
        .select('*');

      if (staffError) {
        console.error('Error fetching staff assignments:', staffError);
        return;
      }

      // Process each booking-date combination
      const missingAssignments: Array<{
        booking_id: string;
        staff_id: string;
        team_id: string;
        assignment_date: string;
      }> = [];

      for (const [key, teams] of bookingDateMap) {
        const [bookingId, eventDate] = key.split('-');
        
        for (const teamId of teams) {
          // Find staff assigned to this team on this date
          const teamStaff = staffAssignments?.filter(
            sa => sa.team_id === teamId && sa.assignment_date === eventDate
          ) || [];

          for (const staff of teamStaff) {
            const assignmentKey = `${bookingId}-${eventDate}-${teamId}-${staff.staff_id}`;
            
            if (!existingKeys.has(assignmentKey)) {
              missingAssignments.push({
                booking_id: bookingId,
                staff_id: staff.staff_id,
                team_id: teamId,
                assignment_date: eventDate
              });
            }
          }
        }
      }

      // Insert missing assignments
      if (missingAssignments.length > 0) {
        console.log(`Creating ${missingAssignments.length} missing booking staff assignments`);
        
        const { error: insertError } = await supabase
          .from('booking_staff_assignments')
          .insert(missingAssignments);

        if (insertError) {
          console.error('Error creating missing assignments:', insertError);
        } else {
          console.log('Successfully created missing booking staff assignments');
        }
      } else {
        console.log('No missing booking staff assignments found');
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

      // Get booking staff assignments
      const { data: bookingAssignments } = await supabase
        .from('booking_staff_assignments')
        .select('*');

      // Get staff assignments
      const { data: staffAssignments } = await supabase
        .from('staff_assignments')
        .select('*');

      // Get staff members
      const { data: staff } = await supabase
        .from('staff_members')
        .select('*');

      console.log('Calendar events:', events?.length || 0);
      console.log('Booking staff assignments:', bookingAssignments?.length || 0);
      console.log('Staff assignments:', staffAssignments?.length || 0);
      console.log('Staff members:', staff?.length || 0);

      // Check coverage by booking
      const bookingCoverage = new Map<string, any>();
      events?.forEach(event => {
        if (!bookingCoverage.has(event.booking_id)) {
          bookingCoverage.set(event.booking_id, {
            events: 0,
            assignments: 0,
            dates: new Set()
          });
        }
        const coverage = bookingCoverage.get(event.booking_id);
        coverage.events++;
        coverage.dates.add(new Date(event.start_time).toISOString().split('T')[0]);
      });

      bookingAssignments?.forEach(assignment => {
        if (bookingCoverage.has(assignment.booking_id)) {
          bookingCoverage.get(assignment.booking_id).assignments++;
        }
      });

      console.log('Coverage by booking:');
      for (const [bookingId, coverage] of bookingCoverage) {
        console.log(`${bookingId}: ${coverage.events} events, ${coverage.assignments} staff assignments, ${coverage.dates.size} dates`);
      }

    } catch (error) {
      console.error('Error in debug:', error);
    }
  }
}
