
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from '@/components/Calendar/StaffTypes';
import { toast } from 'sonner';

// Cache for staff data to prevent repeated fetches
const staffCache = new Map<string, {
  data: StaffMember[],
  timestamp: number
}>();

// Cache expiration time (5 minutes)
const CACHE_EXPIRY = 5 * 60 * 1000;

export function useStaffAvailability(currentDate: Date, fetchEnabled: boolean = true) {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    // Skip fetching if not enabled
    if (!fetchEnabled) return;
    
    const fetchAvailableStaff = async () => {
      try {
        setIsLoading(true);
        const formattedDate = currentDate.toISOString().split('T')[0];
        const cacheKey = `staff-${formattedDate}`;
        
        // Check if we have cached data that's not expired
        const cachedData = staffCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp < CACHE_EXPIRY)) {
          console.log('Using cached staff data');
          setAvailableStaff(cachedData.data);
          setIsLoading(false);
          return;
        }
        
        console.log('Fetching fresh staff data');
        // Call the edge function to get staff availability
        const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
          body: { date: formattedDate }
        });
        
        if (error) {
          console.error('Error fetching staff availability:', error);
          toast.error('Failed to load available staff');
          setIsLoading(false);
          return;
        }
        
        if (data && data.success && data.data) {
          // Transform the data into StaffMember format
          const staffList: StaffMember[] = data.data
            .filter((staff: any) => staff.isavailable)
            .map((staff: any) => ({
              id: staff.id,
              name: staff.name,
              email: staff.email || undefined,
              phone: staff.phone || undefined
            }));
          
          // Cache the result
          staffCache.set(cacheKey, {
            data: staffList,
            timestamp: Date.now()
          });
          
          setAvailableStaff(staffList);
        } else {
          setAvailableStaff([]);
        }
      } catch (error) {
        console.error('Error in fetchAvailableStaff:', error);
        toast.error('Failed to load available staff');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailableStaff();
  }, [currentDate, fetchEnabled]);

  return { availableStaff, isLoading };
}
