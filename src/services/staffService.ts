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

// Add a new staff member to the database
export const addStaffMember = async (name: string, email?: string, phone?: string): Promise<StaffMember> => {
  try {
    // Generate a unique ID for the new staff member
    const id = `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data, error } = await supabase
      .from('staff_members')
      .insert({
        id,
        name,
        email,
        phone
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

// Fetch all staff members
export const fetchStaffMembers = async (): Promise<StaffMember[]> => {
  try {
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .order('name');

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

// Assign staff to a team for a specific date
export const assignStaffToTeam = async (staffId: string, teamId: string, date: Date): Promise<void> => {
  try {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Assigning staff ${staffId} to team ${teamId} for date ${dateStr}`);

    const { data, error } = await supabase
      .from('staff_assignments')
      .upsert({
        staff_id: staffId,
        team_id: teamId,
        assignment_date: dateStr
      }, {
        onConflict: 'staff_id,assignment_date'
      });

    if (error) {
      console.error('Error assigning staff to team:', error);
      throw error;
    }

    console.log('Staff assigned successfully:', data);
  } catch (error) {
    console.error('Error in assignStaffToTeam:', error);
    throw error;
  }
};

// Remove staff assignment for a specific date
export const removeStaffAssignment = async (staffId: string, date: Date): Promise<void> => {
  try {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Removing assignment for staff ${staffId} on date ${dateStr}`);

    const { error } = await supabase
      .from('staff_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('assignment_date', dateStr);

    if (error) {
      console.error('Error removing staff assignment:', error);
      throw error;
    }

    console.log('Staff assignment removed successfully');
  } catch (error) {
    console.error('Error in removeStaffAssignment:', error);
    throw error;
  }
};

// Get available staff (not assigned to any team) for a specific date
export const getAvailableStaff = async (date: Date): Promise<StaffMember[]> => {
  try {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Fetching available staff for date: ${dateStr}`);

    // Get all staff members
    const { data: allStaff, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .order('name');

    if (staffError) {
      console.error('Error fetching all staff:', staffError);
      throw staffError;
    }

    // Get assigned staff IDs for the date
    const { data: assignments, error: assignmentError } = await supabase
      .from('staff_assignments')
      .select('staff_id')
      .eq('assignment_date', dateStr);

    if (assignmentError) {
      console.error('Error fetching assignments:', assignmentError);
      throw assignmentError;
    }

    const assignedStaffIds = new Set(assignments?.map(a => a.staff_id) || []);
    const availableStaff = (allStaff || []).filter(staff => !assignedStaffIds.has(staff.id));

    console.log(`Found ${availableStaff.length} available staff members`);
    return availableStaff;
  } catch (error) {
    console.error('Error in getAvailableStaff:', error);
    throw error;
  }
};
