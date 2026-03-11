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
  const result = await getAvailableStaffForDateRange([date]);
  const dateStr = format(date, 'yyyy-MM-dd');
  return result[dateStr] || [];
};

/**
 * Batch-fetch available staff for multiple dates in a single query.
 * Replaces N sequential calls to getAvailableStaffForDate with 1 staff query + 1 availability query.
 */
export const getAvailableStaffForDateRange = async (
  dates: Date[]
): Promise<Record<string, string[]>> => {
  if (dates.length === 0) return {};

  const dateStrs = dates.map(d => format(d, 'yyyy-MM-dd'));
  const minDate = dateStrs.reduce((a, b) => (a < b ? a : b));
  const maxDate = dateStrs.reduce((a, b) => (a > b ? a : b));

  // Single query: all active staff
  const { data: activeStaff, error: staffError } = await supabase
    .from('staff_members' as any)
    .select('id, name')
    .eq('is_active', true);

  if (staffError || !activeStaff || activeStaff.length === 0) {
    return Object.fromEntries(dateStrs.map(d => [d, []]));
  }

  const activeStaffIds = (activeStaff as any[]).map((s: any) => s.id);

  // Single query: all availability periods that overlap the date range
  const { data: availabilityData, error: availError } = await supabase
    .from('staff_availability' as any)
    .select('*')
    .in('staff_id', activeStaffIds)
    .lte('start_date', maxDate)
    .gte('end_date', minDate);

  if (availError) {
    console.error('Error fetching batch availability:', availError);
    return Object.fromEntries(dateStrs.map(d => [d, []]));
  }

  const periods = (availabilityData as any[]) || [];

  // Build result per date
  const result: Record<string, string[]> = {};

  for (const dateStr of dateStrs) {
    const available: string[] = [];

    for (const staffId of activeStaffIds) {
      const staffPeriods = periods.filter(
        (p: any) => p.staff_id === staffId && p.start_date <= dateStr && p.end_date >= dateStr
      );

      if (staffPeriods.length === 0) continue; // No records = not available

      const hasUnavailable = staffPeriods.some(
        (p: any) => p.availability_type === 'unavailable' || p.availability_type === 'blocked'
      );
      const hasAvailable = staffPeriods.some((p: any) => p.availability_type === 'available');

      if (!hasUnavailable && hasAvailable) {
        available.push(staffId);
      }
    }

    result[dateStr] = available;
  }

  return result;
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
