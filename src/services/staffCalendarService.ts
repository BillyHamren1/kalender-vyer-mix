import { supabase } from "@/integrations/supabase/client";
import { fetchStaffAssignmentsForDateRange, StaffAssignmentResponse } from "./staffAssignmentService";
import { fetchStaffMembers, StaffMember } from "./staffService";
import { format } from "date-fns";
import { deriveStaffEvents } from "@/lib/staffCalendar/deriveStaffEvents";
import { validateLargeProjectGrouping } from "@/lib/staffCalendar/validateLargeProjectGrouping";
import { resolveLargeProjectMembershipFromRows } from "@/lib/largeProject/resolveLargeProjectMembership";
import { formatTeamLabel } from "@/lib/teamLabel";

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

// Get calendar events for selected staff members within a date range.
// Visibility is ASSIGNMENT-driven (booking_staff_assignments + large_project_staff
// + large_projects.start_date/event_date/end_date). calendar_events is used only
// to enrich timing/team/address — never to decide whether a row should exist.
export const getStaffCalendarEvents = async (
  staffIds: string[],
  startDate: Date,
  endDate: Date
): Promise<StaffCalendarEvent[]> => {
  try {
    if (staffIds.length === 0) return [];

    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    console.log(`[staffCalendar] Deriving events for staff=${staffIds.join(',')} ${startDateStr}..${endDateStr}`);

    // Staff name map
    const allStaff = await getCachedStaffMembers();
    const staffNames = new Map(allStaff.map(s => [s.id, s.name]));

    // 1) Booking assignments in range
    const { data: bsa, error: bsaErr } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id, booking_id, team_id, assignment_date')
      .in('staff_id', staffIds)
      .gte('assignment_date', startDateStr)
      .lte('assignment_date', endDateStr);
    if (bsaErr) console.error('[staffCalendar] BSA fetch error:', bsaErr);
    const bookingAssignments = (bsa || []) as any[];

    // 2) Large project memberships (project-wide visibility)
    const { data: lps, error: lpsErr } = await supabase
      .from('large_project_staff')
      .select('staff_id, large_project_id')
      .in('staff_id', staffIds);
    if (lpsErr) console.error('[staffCalendar] large_project_staff fetch error:', lpsErr);
    const largeProjectStaff = (lps || []) as any[];

    // 3) Bookings referenced by assignments
    const bookingIds = Array.from(new Set(bookingAssignments.map(a => a.booking_id))).filter(Boolean);
    const bookings = new Map<string, any>();
    if (bookingIds.length > 0) {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, large_project_id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, deliveryaddress')
        .in('id', bookingIds);
      if (error) console.error('[staffCalendar] bookings fetch error:', error);
      (rows || []).forEach(b => bookings.set(b.id, b));
    }

    // 4) Large projects referenced via memberships, via bookings.large_project_id,
    //    OR (authoritative) via large_project_bookings membership.
    //    large_project_bookings is the MASTER for LP membership; bookings.large_project_id
    //    is a mirrored convenience column that may be stale/NULL on sub-bookings.
    const lpIdsFromMembership = largeProjectStaff.map(r => r.large_project_id);
    const lpIdsFromBookings = Array.from(bookings.values())
      .map((b: any) => b.large_project_id)
      .filter(Boolean);

    // Authoritative lookup: which of our assigned bookings are part of any large project?
    let lpbByBookingRows: Array<{ large_project_id: string; booking_id: string }> = [];
    if (bookingIds.length > 0) {
      const { data: lpbByBooking, error: lpbByBookingErr } = await supabase
        .from('large_project_bookings')
        .select('large_project_id, booking_id')
        .in('booking_id', bookingIds);
      if (lpbByBookingErr) console.error('[staffCalendar] large_project_bookings (by booking) fetch error:', lpbByBookingErr);
      lpbByBookingRows = (lpbByBooking || []) as any[];
    }
    const lpIdsFromLpb = lpbByBookingRows.map(r => r.large_project_id);

    const lpIds = Array.from(new Set([
      ...lpIdsFromMembership,
      ...lpIdsFromBookings,
      ...lpIdsFromLpb,
    ]));

    const largeProjects = new Map<string, any>();
    let largeProjectBookings: Array<{ large_project_id: string; booking_id: string }> = [];
    if (lpIds.length > 0) {
      const [{ data: lpRows, error: lpErr }, { data: lpbRows, error: lpbErr }] = await Promise.all([
        supabase
          .from('large_projects')
          .select('id, name, address, start_date, event_date, end_date, deleted_at')
          .in('id', lpIds)
          .is('deleted_at', null),
        supabase
          .from('large_project_bookings')
          .select('large_project_id, booking_id')
          .in('large_project_id', lpIds),
      ]);
      if (lpErr) console.error('[staffCalendar] large_projects fetch error:', lpErr);
      if (lpbErr) console.error('[staffCalendar] large_project_bookings fetch error:', lpbErr);
      (lpRows || []).forEach((p: any) => largeProjects.set(p.id, p));
      largeProjectBookings = (lpbRows || []) as any[];
    }

    // Dev log: surface large-project grouping inputs for debugging
    if (largeProjects.size > 0) {
      const groupCounts = new Map<string, number>();
      for (const r of largeProjectBookings) {
        groupCounts.set(r.large_project_id, (groupCounts.get(r.large_project_id) || 0) + 1);
      }
      console.log('[staff-calendar-large-project-grouping]', {
        largeProjectIds: Array.from(largeProjects.keys()),
        bookingsByLp: Object.fromEntries(groupCounts),
        recoveredFromLpb: lpIdsFromLpb.filter(id => !lpIdsFromBookings.includes(id) && !lpIdsFromMembership.includes(id)),
      });
    }

    // 5) Calendar events used only for enrichment.
    //    Pull every calendar_event linked to any relevant booking — including
    //    sub-bookings of large projects we have memberships for — so timing,
    //    team and address info is preserved when present.
    const lpLinkedBookingIds = largeProjectBookings.map(r => r.booking_id);
    const allBookingIdsForEnrichment = Array.from(new Set([
      ...bookingIds,
      ...lpLinkedBookingIds,
    ]));

    let calendarEvents: any[] = [];
    if (allBookingIdsForEnrichment.length > 0) {
      const { data: ce, error: ceErr } = await supabase
        .from('calendar_events')
        .select('id, booking_id, start_time, end_time, event_type, resource_id, booking_number, delivery_address, source_date')
        .in('booking_id', allBookingIdsForEnrichment)
        .gte('start_time', `${startDateStr}T00:00:00`)
        .lt('start_time', `${endDateStr}T23:59:59`);
      if (ceErr) console.error('[staffCalendar] calendar_events fetch error:', ceErr);
      calendarEvents = ce || [];
    }

    // 6) Derive
    const derived = deriveStaffEvents({
      staffIds,
      startDate: startDateStr,
      endDate: endDateStr,
      staffNames,
      bookingAssignments,
      largeProjectStaff,
      bookings,
      largeProjects,
      largeProjectBookings,
      calendarEvents,
    });

    // Dev-only: validate large-project grouping & warn loudly on splits.
    if (import.meta.env?.DEV) {
      const bookingToLp = resolveLargeProjectMembershipFromRows(
        Array.from(new Set([...bookingIds, ...largeProjectBookings.map(r => r.booking_id)])),
        largeProjectBookings,
        bookings,
      );
      const lpNames = new Map<string, string>();
      largeProjects.forEach((p: any, id: string) => lpNames.set(id, p?.name || ''));
      validateLargeProjectGrouping({
        events: derived,
        bookingToLargeProject: bookingToLp,
        largeProjectNames: lpNames,
      });
    }

    const events: StaffCalendarEvent[] = derived.map(d => ({
      id: d.id,
      title: d.title,
      start: d.start,
      end: d.end,
      resourceId: d.staffId,
      teamId: d.teamId,
      bookingId: d.bookingId,
      staffName: d.staffName,
      client: d.client,
      eventType: 'booking_event',
      backgroundColor: getEventColor(d.phase),
      borderColor: getEventBorderColor(d.phase),
      extendedProps: {
        bookingId: d.bookingId,
        booking_id: d.bookingId,
        deliveryAddress: d.deliveryAddress,
        bookingNumber: d.bookingNumber,
        eventType: d.phase,
        staffName: d.staffName,
        client: d.client,
        teamName: d.teamId ? formatTeamLabel(d.teamId) : undefined,
        largeProjectId: d.largeProjectId,
        largeProjectName: d.largeProjectName,
        consolidatedBookingIds: d.consolidatedBookingIds,
      },
    }));

    console.log(`[staffCalendar] Derived ${events.length} staff calendar events`);
    return events;
  } catch (error) {
    console.error('[staffCalendar] derivation failed:', error);
    throw error;
  }
};

// DEPRECATED: handleBookingMove removed.
// BSA mirrors staff_assignments × calendar_events.resource_id deterministically.
// Use supabase.rpc('recompute_booking_staff_for_day', { p_booking_id, p_date }) instead.
// See mem://features/planning/calendar-team-model-v1


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
