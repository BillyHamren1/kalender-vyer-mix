
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';
import { format } from 'date-fns';

export const useDateAwareStaffOperations = () => {
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([]);

  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate: Date) => {
    if (!staffId) return;

    const dateStr = format(targetDate, 'yyyy-MM-dd');
    console.log(`DateAware: Assigning staff ${staffId} to ${resourceId || 'unassigned'} for specific date: ${dateStr}`);

    setProcessingStaffIds(prev => [...prev, staffId]);

    try {
      if (resourceId) {
        const toastId = toast.loading(`Assigning staff for ${dateStr}...`);
        await assignStaffToTeam(staffId, resourceId, targetDate);
        toast.success(`Staff assigned to ${resourceId} for ${dateStr}`, { id: toastId });
      } else {
        const toastId = toast.loading(`Removing assignment for ${dateStr}...`);
        await removeStaffAssignment(staffId, targetDate);
        toast.success(`Assignment removed for ${dateStr}`, { id: toastId });
      }

      // Trigger refresh for the specific date
      window.dispatchEvent(new CustomEvent("staff-assignment-updated", { 
        detail: { date: dateStr, staffId, resourceId } 
      }));

    } catch (error) {
      toast.error(`Failed to update assignment for ${dateStr}`);
      console.error(error);
    } finally {
      setProcessingStaffIds(prev => prev.filter(id => id !== staffId));
    }
  }, []);

  return {
    processingStaffIds,
    handleStaffDrop
  };
};
