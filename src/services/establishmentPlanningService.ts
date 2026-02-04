import { supabase } from "@/integrations/supabase/client";

export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  setupHours: number | null;
  laborCost: number | null;
  materialCost: number | null;
  externalCost: number | null;
  isPackageComponent: boolean;
  parentPackageId: string | null;
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

export interface BookingInfo {
  bookingNumber: string | null;
  status: string | null;
  client: string;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryPostalCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  carryMoreThan10m: boolean;
  groundNailsAllowed: boolean;
  exactTimeNeeded: boolean;
  exactTimeInfo: string | null;
  internalNotes: string | null;
}

export interface AssignedStaff {
  id: string;
  name: string;
  role: string | null;
  hourlyRate: number | null;
  assignment_date: string;
  team_id: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  projectLeader: string | null;
  tasksCompleted: number;
  tasksTotal: number;
}

export interface TimeReportSummary {
  totalHours: number;
  reportCount: number;
  averageHoursPerDay: number;
}

export interface PackingInfo {
  id: string;
  name: string;
  status: string;
  itemsPacked: number;
  itemsTotal: number;
}

export interface EstablishmentBookingData {
  booking: BookingInfo;
  products: BookingProduct[];
  dates: BookingDateInfo;
  assignedStaff: AssignedStaff[];
  project: ProjectInfo | null;
  timeReports: TimeReportSummary | null;
  packing: PackingInfo | null;
}

export const fetchEstablishmentBookingData = async (bookingId: string): Promise<EstablishmentBookingData> => {
  // Fetch full booking info including logistics
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      booking_number,
      status,
      client,
      deliveryaddress,
      delivery_city,
      delivery_postal_code,
      contact_name,
      contact_phone,
      contact_email,
      carry_more_than_10m,
      ground_nails_allowed,
      exact_time_needed,
      exact_time_info,
      internalnotes,
      rigdaydate,
      eventdate,
      rigdowndate,
      rig_start_time,
      rig_end_time,
      event_start_time,
      event_end_time,
      rigdown_start_time,
      rigdown_end_time,
      assigned_project_id
    `)
    .eq('id', bookingId)
    .single();

  if (bookingError) throw bookingError;

  // Fetch products with all cost fields
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select(`
      id, 
      name, 
      quantity, 
      notes,
      unit_price,
      total_price,
      setup_hours,
      labor_cost,
      material_cost,
      external_cost,
      is_package_component,
      parent_package_id
    `)
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;

  // Fetch staff assignments
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

  // Get staff member details including hourly rate
  const staffIds = [...new Set(staffAssignments?.map(a => a.staff_id) || [])];
  
  let staffMembers: { id: string; name: string; role: string | null; hourly_rate: number | null }[] = [];
  if (staffIds.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from('staff_members')
      .select('id, name, role, hourly_rate')
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
      hourlyRate: member?.hourly_rate || null,
      assignment_date: assignment.assignment_date,
      team_id: assignment.team_id
    };
  });

  // Fetch project info if linked
  let projectInfo: ProjectInfo | null = null;
  if (booking.assigned_project_id) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, status, project_leader')
      .eq('id', booking.assigned_project_id)
      .single();
    
    if (!projectError && project) {
      // Get task counts
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('id, completed')
        .eq('project_id', project.id);
      
      const tasksTotal = tasks?.length || 0;
      const tasksCompleted = tasks?.filter(t => t.completed).length || 0;
      
      projectInfo = {
        id: project.id,
        name: project.name,
        status: project.status,
        projectLeader: project.project_leader,
        tasksCompleted,
        tasksTotal
      };
    }
  }

  // Fetch time reports for this booking
  let timeReportSummary: TimeReportSummary | null = null;
  const { data: timeReports, error: timeReportsError } = await supabase
    .from('time_reports')
    .select('hours_worked, report_date')
    .eq('booking_id', bookingId);
  
  if (!timeReportsError && timeReports && timeReports.length > 0) {
    const totalHours = timeReports.reduce((sum, tr) => sum + (tr.hours_worked || 0), 0);
    const uniqueDates = new Set(timeReports.map(tr => tr.report_date));
    timeReportSummary = {
      totalHours,
      reportCount: timeReports.length,
      averageHoursPerDay: uniqueDates.size > 0 ? totalHours / uniqueDates.size : 0
    };
  }

  // Fetch packing info
  let packingInfo: PackingInfo | null = null;
  const { data: packing, error: packingError } = await supabase
    .from('packing_projects')
    .select('id, name, status')
    .eq('booking_id', bookingId)
    .maybeSingle();
  
  if (!packingError && packing) {
    // Get packing list item counts
    const { data: packingItems } = await supabase
      .from('packing_list_items')
      .select('id, quantity_to_pack, quantity_packed')
      .eq('packing_id', packing.id);
    
    const itemsTotal = packingItems?.length || 0;
    const itemsPacked = packingItems?.filter(item => item.quantity_packed >= item.quantity_to_pack).length || 0;
    
    packingInfo = {
      id: packing.id,
      name: packing.name,
      status: packing.status,
      itemsPacked,
      itemsTotal
    };
  }

  return {
    booking: {
      bookingNumber: booking.booking_number,
      status: booking.status,
      client: booking.client,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      deliveryPostalCode: booking.delivery_postal_code,
      contactName: booking.contact_name,
      contactPhone: booking.contact_phone,
      contactEmail: booking.contact_email,
      carryMoreThan10m: booking.carry_more_than_10m || false,
      groundNailsAllowed: booking.ground_nails_allowed ?? true,
      exactTimeNeeded: booking.exact_time_needed || false,
      exactTimeInfo: booking.exact_time_info,
      internalNotes: booking.internalnotes
    },
    products: (products || []).map(p => ({
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      notes: p.notes,
      unitPrice: p.unit_price,
      totalPrice: p.total_price,
      setupHours: p.setup_hours,
      laborCost: p.labor_cost,
      materialCost: p.material_cost,
      externalCost: p.external_cost,
      isPackageComponent: p.is_package_component || false,
      parentPackageId: p.parent_package_id
    })),
    dates: {
      rigdaydate: booking.rigdaydate,
      eventdate: booking.eventdate,
      rigdowndate: booking.rigdowndate,
      rig_start_time: booking.rig_start_time,
      rig_end_time: booking.rig_end_time,
      event_start_time: booking.event_start_time,
      event_end_time: booking.event_end_time,
      rigdown_start_time: booking.rigdown_start_time,
      rigdown_end_time: booking.rigdown_end_time
    },
    assignedStaff,
    project: projectInfo,
    timeReports: timeReportSummary,
    packing: packingInfo
  };
};
