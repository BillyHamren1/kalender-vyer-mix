
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
  // Generate a unique ID for the staff member
  const id = `staff-${Date.now()}`;

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
  
  return data;
};

// Add or update a staff member with a specific ID (for syncing with external API)
export const syncStaffMember = async (id: string, name: string, email?: string, phone?: string) => {
  try {
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
  } catch (error) {
    console.error('Error in syncStaffMember:', error);
    throw error;
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

// Fetch staff assignments for a specific date and optionally for a specific team
export const fetchStaffAssignments = async (date: Date, teamId?: string) => {
  try {
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log(`Fetching staff assignments for date: ${formattedDate}, team: ${teamId || 'all teams'}`);
    
    let query = supabase
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
    
    // If teamId is provided, filter by team_id as well
    if (teamId) {
      query = query.eq('team_id', teamId);
    }
      
    const { data, error } = await query;
      
    if (error) {
      console.error('Error fetching staff assignments:', error);
      throw error;
    }
    
    console.log(`Retrieved ${data?.length || 0} staff assignments`);
    return data || [];
  } catch (error) {
    console.error('Error in fetchStaffAssignments:', error);
    throw error;
  }
};

// Assign a staff member to a team for a specific date
export const assignStaffToTeam = async (staffId: string, teamId: string, date: Date) => {
  try {
    console.log(`Assigning staff ${staffId} to team ${teamId} on ${date.toISOString().split('T')[0]}`);
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Check if an assignment already exists for this staff member on this date
    const { data: existingAssignment, error: checkError } = await supabase
      .from('staff_assignments')
      .select('id')
      .eq('staff_id', staffId)
      .eq('assignment_date', formattedDate)
      .maybeSingle();
    
    if (checkError) {
      console.error('Error checking existing assignment:', checkError);
      throw checkError;
    }
    
    if (existingAssignment) {
      console.log(`Updating existing assignment ${existingAssignment.id}`);
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
      
      console.log('Assignment updated successfully');
      return data;
    } else {
      console.log('Creating new assignment');
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
      
      console.log('New assignment created successfully');
      return data;
    }
  } catch (error) {
    console.error('Error in assignStaffToTeam:', error);
    throw error;
  }
};

// Remove a staff assignment for a specific date
export const removeStaffAssignment = async (staffId: string, date: Date) => {
  try {
    console.log(`Removing assignment for staff ${staffId} on ${date.toISOString().split('T')[0]}`);
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
    
    console.log('Assignment removed successfully');
    return true;
  } catch (error) {
    console.error('Error in removeStaffAssignment:', error);
    throw error;
  }
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
