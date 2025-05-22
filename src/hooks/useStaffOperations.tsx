
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';

export const useStaffOperations = (currentDate: Date) => {
  const [staffCurtainOpen, setStaffCurtainOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);

  // Handle staff drop for assignment
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    try {
      console.log(`Handling staff drop: staff=${staffId}, resource=${resourceId}`);
      if (resourceId) {
        toast.info(`Assigning staff ${staffId} to team ${resourceId}...`);
        try {
          await assignStaffToTeam(staffId, resourceId, currentDate);
          toast.success('Staff assigned to team successfully');
        } catch (error) {
          console.error('Error assigning staff to team:', error);
          toast.error('Failed to assign staff to team. Please try again.');
          return Promise.reject(error);
        }
      } else {
        toast.info(`Removing staff ${staffId} assignment...`);
        try {
          await removeStaffAssignment(staffId, currentDate);
          toast.success('Staff assignment removed successfully');
        } catch (error) {
          console.error('Error removing staff assignment:', error);
          toast.error('Failed to remove staff assignment. Please try again.');
          return Promise.reject(error);
        }
      }
      
      // Trigger a refresh of the staff assignments
      setStaffAssignmentsUpdated(prev => !prev);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error handling staff drop:', error);
      toast.error('Failed to update staff assignment');
      return Promise.reject(error);
    }
  }, [currentDate]);

  // Handle opening the staff selection curtain
  const handleSelectStaffForTeam = useCallback((teamId: string, teamName: string) => {
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName);
    setStaffCurtainOpen(true);
  }, []);

  // Show the staff curtain directly (without team selection)
  const handleShowStaffCurtain = useCallback(() => {
    setSelectedTeamId(null);
    setSelectedTeamName('');
    setStaffCurtainOpen(true);
  }, []);

  return {
    staffCurtainOpen,
    setStaffCurtainOpen,
    selectedTeamId,
    selectedTeamName,
    staffAssignmentsUpdated,
    handleStaffDrop,
    handleSelectStaffForTeam,
    handleShowStaffCurtain
  };
};
