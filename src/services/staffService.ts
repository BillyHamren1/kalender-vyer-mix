import { supabase } from "@/integrations/supabase/client";

export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  role?: string;
  department?: string;
  salary?: number;
  hire_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
  assignedTeam?: string;
  color?: string;
  hourly_rate?: number;
  overtime_rate?: number;
  tags?: string[];
}

export interface StaffAssignment {
  id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  staff_members?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    color?: string;
  };
  // Alternative field names for backward compatibility
  staff_name?: string;
  name?: string;
  email?: string;
  phone?: string;
}

// Update staff member color
export const updateStaffColor = async (staffId: string, color: string): Promise<void> => {
  try {
    console.log(`Updating color for staff ${staffId} to ${color}`);
    
    const { error } = await supabase
      .from('staff_members')
      .update({ color })
      .eq('id', staffId);

    if (error) {
      console.error('Error updating staff color:', error);
      throw error;
    }

    console.log('Staff color updated successfully');
  } catch (error) {
    console.error('Error in updateStaffColor:', error);
    throw error;
  }
};

// Sync staff member from external API to local database
export const syncStaffMember = async (staffData: any): Promise<void> => {
  try {
    console.log('Syncing staff member:', staffData);
    
    const { data, error } = await supabase
      .from('staff_members')
      .upsert({
        id: staffData.id,
        name: staffData.name,
        email: staffData.email,
        phone: staffData.phone,
        address: staffData.address,
        city: staffData.city,
        postal_code: staffData.postal_code,
        role: staffData.role,
        department: staffData.department,
        salary: staffData.salary,
        hire_date: staffData.hire_date,
        emergency_contact_name: staffData.emergency_contact_name,
        emergency_contact_phone: staffData.emergency_contact_phone,
        notes: staffData.notes,
        hourly_rate: staffData.hourly_rate,
        overtime_rate: staffData.overtime_rate,
        tags: staffData.tags || [],
      }, {
        onConflict: 'id'
      });

    if (error) {
      console.error('Error updating staff member:', error);
      
      // If it's a unique constraint error on email, try to handle it gracefully
      if (error.code === '23505' && error.message.includes('email')) {
        console.log('Email already exists, attempting to update existing record...');
        
        // Try to update the existing record by email
        const { error: updateError } = await supabase
          .from('staff_members')
          .update({
            name: staffData.name,
            phone: staffData.phone,
            address: staffData.address,
            city: staffData.city,
            postal_code: staffData.postal_code,
            role: staffData.role,
            department: staffData.department,
            salary: staffData.salary,
            hire_date: staffData.hire_date,
            emergency_contact_name: staffData.emergency_contact_name,
            emergency_contact_phone: staffData.emergency_contact_phone,
            notes: staffData.notes,
            hourly_rate: staffData.hourly_rate,
            overtime_rate: staffData.overtime_rate,
            tags: staffData.tags || [],
          })
          .eq('email', staffData.email);
        
        if (updateError) {
          console.error('Error in syncStaffMember:', updateError);
          throw updateError;
        }
      } else {
        throw error;
      }
    }

    console.log('Staff member synced successfully:', data);
  } catch (error) {
    console.error('Error in syncStaffMember:', error);
    throw error;
  }
};

// Add a new staff member to the database with complete information
export const addStaffMember = async (staffData: Omit<StaffMember, 'id'>): Promise<StaffMember> => {
  try {
    // Generate a unique ID for the new staff member
    const id = `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data, error } = await supabase
      .from('staff_members')
      .insert({
        id,
        name: staffData.name,
        email: staffData.email,
        phone: staffData.phone,
        address: staffData.address,
        city: staffData.city,
        postal_code: staffData.postal_code,
        role: staffData.role,
        department: staffData.department,
        salary: staffData.salary,
        hire_date: staffData.hire_date,
        emergency_contact_name: staffData.emergency_contact_name,
        emergency_contact_phone: staffData.emergency_contact_phone,
        notes: staffData.notes,
        hourly_rate: staffData.hourly_rate,
        overtime_rate: staffData.overtime_rate,
        color: staffData.color || '#E3F2FD',
        tags: staffData.tags || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding staff member:', error);
      throw error;
    }

    console.log('Staff member added successfully:', data);
    return data;
  } catch (error) {
    console.error('Error in addStaffMember:', error);
    throw error;
  }
};

// Fetch staff members. Default = ENDAST aktiva (kalender, planering, tilldelning).
// Sätt includeInactive=true endast i admin-vyer (StaffManagement, konto-admin) som måste
// kunna se/ändra inaktiv personal.
export const fetchStaffMembers = async (
  options: { includeInactive?: boolean } = {}
): Promise<StaffMember[]> => {
  try {
    let query = supabase
      .from('staff_members')
      .select('*')
      .order('name');

    if (!options.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching staff members:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchStaffMembers:', error);
    throw error;
  }
};

// Fetch staff assignments for a specific date and optionally a specific team
export const fetchStaffAssignments = async (date: Date, teamId?: string): Promise<StaffAssignment[]> => {
  try {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Fetching staff assignments for date: ${dateStr}, team: ${teamId || 'all teams'}`);

    let query = supabase
      .from('staff_assignments')
      .select(`
        *,
        staff_members (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('assignment_date', dateStr);

    // If teamId is provided, filter by team
    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching staff assignments:', error);
      throw error;
    }

    console.log(`Retrieved ${data?.length || 0} staff assignments`, data);
    return data || [];
  } catch (error) {
    console.error('Error in fetchStaffAssignments:', error);
    throw error;
  }
};

// Assign staff to a team for a specific date.
// Delegates to the canonical core writer (staffAssignmentCore).
export const assignStaffToTeam = async (
  staffId: string,
  teamId: string,
  date: Date,
): Promise<void> => {
  // Availability gate — blocked/unavailable staff cannot be assigned.
  const { isStaffAvailableOnDate } = await import('@/services/staffAvailabilityService');
  const isAvailable = await isStaffAvailableOnDate(staffId, date);
  if (!isAvailable) {
    throw new Error('Staff member is not available on this date (blocked or unavailable period)');
  }
  const { assignStaffToTeamCore } = await import('@/services/staffAssignmentCore');
  await assignStaffToTeamCore(staffId, teamId, date);
};

// Remove staff assignment. If teamId is provided, only that team-row is
// removed; otherwise all rows for the date are removed.
// Delegates to the canonical core writer (staffAssignmentCore).
export const removeStaffAssignment = async (
  staffId: string,
  date: Date,
  teamId?: string,
): Promise<void> => {
  const { removeStaffAssignmentCore } = await import('@/services/staffAssignmentCore');
  await removeStaffAssignmentCore(staffId, date, teamId);
};

// Get all active staff for a date, decorated with which teams they already
// belong to (multi-team aware — never excludes assigned staff anymore).
export const getAvailableStaff = async (
  date: Date,
): Promise<Array<StaffMember & { assignedTeamIds: string[] }>> => {
  try {
    const dateStr = date.toISOString().split('T')[0];

    const { data: allStaff, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .order('name');

    if (staffError) {
      console.error('Error fetching all staff:', staffError);
      throw staffError;
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('staff_assignments')
      .select('staff_id, team_id')
      .eq('assignment_date', dateStr);

    if (assignmentError) {
      console.error('Error fetching assignments:', assignmentError);
      throw assignmentError;
    }

    const teamsByStaff = new Map<string, string[]>();
    for (const row of assignments || []) {
      const list = teamsByStaff.get(row.staff_id) || [];
      list.push(row.team_id);
      teamsByStaff.set(row.staff_id, list);
    }

    return (allStaff || []).map((s: any) => ({
      ...s,
      assignedTeamIds: teamsByStaff.get(s.id) || [],
    }));
  } catch (error) {
    console.error('Error in getAvailableStaff:', error);
    throw error;
  }
};
