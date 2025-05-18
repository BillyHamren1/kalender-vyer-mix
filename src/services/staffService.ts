
import { supabase } from "@/integrations/supabase/client";

// Fetch all staff members
export const fetchStaffMembers = async () => {
  const { data, error } = await supabase
    .from('staff_members')
    .select('*')
    .order('name');
    
  if (error) {
    console.error('Error fetching staff members:', error);
    throw error;
  }
  
  return data || [];
};

// Add a new staff member
export const addStaffMember = async (name: string, email?: string, phone?: string) => {
  const { data, error } = await supabase
    .from('staff_members')
    .insert({
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
  
  return data;
};

// Add or update a staff member with a specific ID (for syncing with external API)
export const syncStaffMember = async (id: string, name: string, email?: string, phone?: string) => {
  // First check if the staff member already exists
  const { data: existingStaff } = await supabase
    .from('staff_members')
    .select('id')
    .eq('id', id)
    .maybeSingle();
    
  if (existingStaff) {
    // Update existing staff member
    const { data, error } = await supabase
      .from('staff_members')
      .update({
        name,
        email,
        phone
      })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating staff member:', error);
      throw error;
    }
    
    return data;
  } else {
    // Insert new staff member with specific ID
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
      console.error('Error adding staff member with ID:', error);
      throw error;
    }
    
    return data;
  }
};

// Update a staff member
export const updateStaffMember = async (id: string, updates: { name?: string, email?: string, phone?: string }) => {
  const { data, error } = await supabase
    .from('staff_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    console.error('Error updating staff member:', error);
    throw error;
  }
  
  return data;
};

// Delete a staff member
export const deleteStaffMember = async (id: string) => {
  const { error } = await supabase
    .from('staff_members')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error('Error deleting staff member:', error);
    throw error;
  }
  
  return true;
};

// Fetch staff assignments for a specific date
export const fetchStaffAssignments = async (date: Date) => {
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(`
      id,
      team_id,
      staff_id,
      assignment_date,
      staff_members (
        id,
        name,
        email,
        phone
      )
    `)
    .eq('assignment_date', formattedDate);
    
  if (error) {
    console.error('Error fetching staff assignments:', error);
    throw error;
  }
  
  return data || [];
};

// Assign a staff member to a team for a specific date
export const assignStaffToTeam = async (staffId: string, teamId: string, date: Date) => {
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Check if an assignment already exists for this staff member on this date
  const { data: existingAssignment } = await supabase
    .from('staff_assignments')
    .select('id')
    .eq('staff_id', staffId)
    .eq('assignment_date', formattedDate)
    .maybeSingle();
  
  if (existingAssignment) {
    // Update existing assignment
    const { data, error } = await supabase
      .from('staff_assignments')
      .update({
        team_id: teamId,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingAssignment.id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating staff assignment:', error);
      throw error;
    }
    
    return data;
  } else {
    // Create new assignment
    const { data, error } = await supabase
      .from('staff_assignments')
      .insert({
        staff_id: staffId,
        team_id: teamId,
        assignment_date: formattedDate
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error creating staff assignment:', error);
      throw error;
    }
    
    return data;
  }
};

// Remove a staff assignment for a specific date
export const removeStaffAssignment = async (staffId: string, date: Date) => {
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const { error } = await supabase
    .from('staff_assignments')
    .delete()
    .eq('staff_id', staffId)
    .eq('assignment_date', formattedDate);
    
  if (error) {
    console.error('Error removing staff assignment:', error);
    throw error;
  }
  
  return true;
};

// Get all assignments for a staff member within a date range
export const getStaffAssignmentsForPeriod = async (staffId: string, startDate: Date, endDate: Date) => {
  const startFormatted = startDate.toISOString().split('T')[0];
  const endFormatted = endDate.toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(`
      id,
      team_id,
      assignment_date
    `)
    .eq('staff_id', staffId)
    .gte('assignment_date', startFormatted)
    .lte('assignment_date', endFormatted)
    .order('assignment_date');
    
  if (error) {
    console.error('Error fetching staff assignments for period:', error);
    throw error;
  }
  
  return data || [];
};

