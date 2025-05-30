
import { useMemo } from 'react';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import { Resource } from '@/components/Calendar/ResourceData';
import { format, addDays } from 'date-fns';

interface WeeklyStaffSummary {
  teamId: string;
  maxStaffCount: number;
  minHeight: number;
}

export const useWeeklyStaffSummary = (
  currentWeekStart: Date,
  resources: Resource[]
): { weeklyStaffSummary: WeeklyStaffSummary[], isLoading: boolean } => {
  // Use reliable staff operations to get staff data
  const { getStaffForTeam, isLoading } = useReliableStaffOperations(currentWeekStart);

  const weeklyStaffSummary = useMemo(() => {
    console.log('useWeeklyStaffSummary: Calculating weekly staff summary for week starting:', format(currentWeekStart, 'yyyy-MM-dd'));

    const summary: WeeklyStaffSummary[] = resources.map(resource => {
      let maxStaffCount = 0;

      // Check all 7 days of the week
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDate = addDays(currentWeekStart, dayOffset);
        
        // Get staff for this team on this specific date
        const staffForDay = getStaffForTeam(resource.id);
        const staffCount = staffForDay.length;
        
        if (staffCount > maxStaffCount) {
          maxStaffCount = staffCount;
        }
        
        console.log(`useWeeklyStaffSummary: ${resource.id} on ${format(checkDate, 'yyyy-MM-dd')}: ${staffCount} staff`);
      }

      // Calculate minimum height based on max staff count
      const minHeight = Math.max(80, 60 + (maxStaffCount * 35));
      
      console.log(`useWeeklyStaffSummary: ${resource.id} - Max staff: ${maxStaffCount}, Min height: ${minHeight}px`);

      return {
        teamId: resource.id,
        maxStaffCount,
        minHeight
      };
    });

    return summary;
  }, [currentWeekStart, resources, getStaffForTeam]);

  return {
    weeklyStaffSummary,
    isLoading
  };
};
