import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export type AvailabilityType = 'available' | 'unavailable' | 'blocked';

export interface StaffAvailability {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  availability_type: AvailabilityType;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffAvailabilityInput {
  staff_id: string;
  start_date: Date;
  end_date: Date;
  availability_type: AvailabilityType;
  notes?: string;
}

/**
 * Fetch all availability records for a specific staff member
 */
export const getStaffAvailability = async (staffId: string): Promise<StaffAvailability[]> => {
  const { data, error } = await supabase
    .from('staff_availability' as any)
    .select('*')
    .eq('staff_id', staffId)
    .order('start_date', { ascending: true });

  if (error) {
    console.error('Error fetching staff availability:', error);
    throw error;
  }

  return (data as any) || [];
};

/**
 * Create a new availability period
 */
export const createAvailability = async (
  availability: StaffAvailabilityInput
): Promise<StaffAvailability> => {
  const { data, error } = await supabase
    .from('staff_availability' as any)
    .insert({
      staff_id: availability.staff_id,
      start_date: format(availability.start_date, 'yyyy-MM-dd'),
      end_date: format(availability.end_date, 'yyyy-MM-dd'),
      availability_type: availability.availability_type,
      notes: availability.notes,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating availability:', error);
    throw error;
  }

  return data as any;
};

/**
 * Update an existing availability period
 */
export const updateAvailability = async (
  id: string,
  updates: Partial<StaffAvailabilityInput>
): Promise<StaffAvailability> => {
  const updateData: any = {};
  
  if (updates.start_date) {
    updateData.start_date = format(updates.start_date, 'yyyy-MM-dd');
  }
  if (updates.end_date) {
    updateData.end_date = format(updates.end_date, 'yyyy-MM-dd');
  }
  if (updates.availability_type) {
    updateData.availability_type = updates.availability_type;
  }
  if (updates.notes !== undefined) {
    updateData.notes = updates.notes;
  }

  const { data, error } = await supabase
    .from('staff_availability' as any)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating availability:', error);
    throw error;
  }

  return data as any;
};

/**
 * Delete an availability period
 */
export const deleteAvailability = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('staff_availability' as any)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting availability:', error);
    throw error;
  }
};

/**
 * Check if a staff member is available on a specific date
 */
export const isStaffAvailableOnDate = async (
  staffId: string,
  date: Date
): Promise<boolean> => {
  const dateStr = format(date, 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('staff_availability' as any)
    .select('*')
    .eq('staff_id', staffId)
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);

  if (error) {
    console.error('Error checking availability:', error);
    return false;
  }

  if (!data || data.length === 0) {
    return false;
  }

  // Check if any period marks this date as available
  const hasAvailable = (data as any[]).some((period: any) => period.availability_type === 'available');
  const hasUnavailable = (data as any[]).some(
    (period: any) => period.availability_type === 'unavailable' || period.availability_type === 'blocked'
  );

  // If there's an unavailable/blocked period, staff is not available
  if (hasUnavailable) {
    return false;
  }

  return hasAvailable;
};

/**
 * Get all available staff for a specific date
 */
export const getAvailableStaffForDate = async (date: Date): Promise<string[]> => {
  const dateStr = format(date, 'yyyy-MM-dd');
  
  console.log('🔍 [getAvailableStaffForDate] Checking availability for date:', dateStr);

  // Get all active staff members
  const { data: activeStaff, error: staffError } = await supabase
    .from('staff_members' as any)
    .select('id, name')
    .eq('is_active', true);

  if (staffError) {
    console.error('❌ [getAvailableStaffForDate] Error fetching active staff:', staffError);
    return [];
  }

  if (!activeStaff || activeStaff.length === 0) {
    console.log('⚠️ [getAvailableStaffForDate] No active staff found');
    return [];
  }

  const activeStaffIds = (activeStaff as any[]).map((s: any) => s.id);
  console.log('📋 [getAvailableStaffForDate] Active staff:', activeStaff.map((s: any) => s.name).join(', '));

  // Get availability periods that cover this date
  const { data: availabilityData, error: availError } = await supabase
    .from('staff_availability' as any)
    .select('*')
    .in('staff_id', activeStaffIds)
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);

  if (availError) {
    console.error('❌ [getAvailableStaffForDate] Error fetching availability:', availError);
    return [];
  }

  console.log('📅 [getAvailableStaffForDate] Found', availabilityData?.length || 0, 'availability periods covering this date:', availabilityData);

  // Filter staff based on availability
  const availableStaffIds: string[] = [];

  for (const staffId of activeStaffIds) {
    const staffName = (activeStaff as any[]).find((s: any) => s.id === staffId)?.name || staffId;
    const staffPeriods = ((availabilityData as any[]) || []).filter((p: any) => p.staff_id === staffId);

    console.log(`👤 [getAvailableStaffForDate] Checking ${staffName}:`, staffPeriods.length, 'periods');

    if (staffPeriods.length === 0) {
      console.log(`  ⚠️ No availability records for ${staffName} - NOT AVAILABLE`);
      continue;
    }

    const hasUnavailable = staffPeriods.some(
      (p: any) => p.availability_type === 'unavailable' || p.availability_type === 'blocked'
    );
    const hasAvailable = staffPeriods.some((p: any) => p.availability_type === 'available');

    console.log(`  📊 ${staffName}: hasAvailable=${hasAvailable}, hasUnavailable=${hasUnavailable}`);

    if (!hasUnavailable && hasAvailable) {
      console.log(`  ✅ ${staffName} is AVAILABLE`);
      availableStaffIds.push(staffId);
    } else {
      console.log(`  ❌ ${staffName} is NOT AVAILABLE (blocked or no available period)`);
    }
  }

  console.log('✅ [getAvailableStaffForDate] Final result:', availableStaffIds.length, 'staff available');
  return availableStaffIds;
};

/**
 * Update staff active status
 */
export const updateStaffActiveStatus = async (
  staffId: string,
  isActive: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('staff_members' as any)
    .update({ is_active: isActive } as any)
    .eq('id', staffId);

  if (error) {
    console.error('Error updating staff active status:', error);
    throw error;
  }
};
