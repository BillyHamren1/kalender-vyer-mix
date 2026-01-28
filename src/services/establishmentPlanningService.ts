import { supabase } from "@/integrations/supabase/client";

export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

export interface BookingDateInfo {
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
}

export interface AssignedStaff {
  id: string;
  name: string;
  role: string | null;
  assignment_date: string;
  team_id: string;
}

export interface EstablishmentBookingData {
  products: BookingProduct[];
  dates: BookingDateInfo;
  assignedStaff: AssignedStaff[];
}

export const fetchEstablishmentBookingData = async (bookingId: string): Promise<EstablishmentBookingData> => {
  // Fetch products
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('id, name, quantity, notes')
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;

  // Fetch booking dates
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      rigdaydate,
      eventdate,
      rigdowndate,
      rig_start_time,
      rig_end_time,
      event_start_time,
      event_end_time,
      rigdown_start_time,
      rigdown_end_time
    `)
    .eq('id', bookingId)
    .single();

  if (bookingError) throw bookingError;

  // Fetch assigned staff
  const { data: staffAssignments, error: staffError } = await supabase
    .from('booking_staff_assignments')
    .select(`
      id,
      staff_id,
      assignment_date,
      team_id
    `)
    .eq('booking_id', bookingId);

  if (staffError) throw staffError;

  // Get staff member names
  const staffIds = [...new Set(staffAssignments?.map(a => a.staff_id) || [])];
  
  let staffMembers: { id: string; name: string; role: string | null }[] = [];
  if (staffIds.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from('staff_members')
      .select('id, name, role')
      .in('id', staffIds);
    
    if (membersError) throw membersError;
    staffMembers = members || [];
  }

  // Map assignments with staff info
  const assignedStaff: AssignedStaff[] = (staffAssignments || []).map(assignment => {
    const member = staffMembers.find(m => m.id === assignment.staff_id);
    return {
      id: assignment.staff_id,
      name: member?.name || 'Okänd',
      role: member?.role || null,
      assignment_date: assignment.assignment_date,
      team_id: assignment.team_id
    };
  });

  return {
    products: products || [],
    dates: booking as BookingDateInfo,
    assignedStaff
  };
};
