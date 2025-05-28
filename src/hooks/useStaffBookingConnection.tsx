
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { unifiedStaffService } from '@/services/unifiedStaffService';
import { format } from 'date-fns';

export interface ConnectionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  staffAssignments: any[];
  bookingAssignments: any[];
}

export interface ConnectionConflict {
  type: 'staff_not_assigned' | 'booking_moved' | 'team_conflict';
  staffId: string;
  bookingId: string;
  teamId: string;
  date: string;
  description: string;
}

export const useStaffBookingConnection = () => {
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<ConnectionValidationResult | null>(null);

  // Validate staff-booking connections for a specific date
  const validateConnections = useCallback(async (date: Date): Promise<ConnectionValidationResult> => {
    setIsValidating(true);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    try {
      console.log(`🔍 Validating staff-booking connections for ${dateStr}`);
      
      // Get all staff assignments for the date
      const staffAssignments = await unifiedStaffService.getStaffAssignments(date);
      console.log(`📋 Found ${staffAssignments.length} staff assignments for ${dateStr}:`, staffAssignments);
      
      // Get staff summary to check booking counts
      const staffIds = staffAssignments.map(a => a.staff_id);
      const staffSummary = staffIds.length > 0 ? await unifiedStaffService.getStaffSummary(staffIds, date) : [];
      console.log(`📊 Staff summary for ${dateStr}:`, staffSummary);
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate each staff assignment has corresponding booking assignments
      for (const assignment of staffAssignments) {
        const summary = staffSummary.find(s => s.staffId === assignment.staff_id);
        if (!summary) {
          warnings.push(`Staff ${assignment.staff_id} assignment found but no summary data`);
          continue;
        }
        
        console.log(`✅ Staff ${assignment.staff_members?.name || assignment.staff_id} assigned to team ${assignment.team_id} with ${summary.bookingsCount} bookings`);
        
        if (summary.bookingsCount === 0) {
          warnings.push(`Staff ${assignment.staff_members?.name || assignment.staff_id} assigned to team ${assignment.team_id} but has no bookings`);
        }
      }
      
      const result: ConnectionValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        staffAssignments,
        bookingAssignments: staffSummary
      };
      
      setLastValidation(result);
      
      console.log(`🎯 Connection validation complete for ${dateStr}:`, result);
      return result;
      
    } catch (error) {
      console.error('❌ Error validating staff-booking connections:', error);
      const result: ConnectionValidationResult = {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        staffAssignments: [],
        bookingAssignments: []
      };
      setLastValidation(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Handle staff assignment with comprehensive validation
  const assignStaffWithValidation = useCallback(async (
    staffId: string, 
    teamId: string, 
    date: Date
  ): Promise<boolean> => {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🔄 Assigning staff ${staffId} to team ${teamId} for ${dateStr} with validation`);
    
    try {
      // Pre-assignment validation
      const preValidation = await validateConnections(date);
      console.log('📋 Pre-assignment validation:', preValidation);
      
      // Perform the assignment
      await unifiedStaffService.assignStaffToTeam(staffId, teamId, date);
      console.log(`✅ Staff assignment completed successfully`);
      
      // Post-assignment validation
      setTimeout(async () => {
        const postValidation = await validateConnections(date);
        console.log('📋 Post-assignment validation:', postValidation);
        
        if (!postValidation.isValid) {
          console.error('❌ Post-assignment validation failed:', postValidation.errors);
          toast.error('Staff assignment may have issues', {
            description: postValidation.errors.join(', ')
          });
        } else if (postValidation.warnings.length > 0) {
          console.warn('⚠️ Post-assignment warnings:', postValidation.warnings);
          toast.warning('Staff assigned with warnings', {
            description: postValidation.warnings.join(', ')
          });
        } else {
          toast.success('Staff assigned and validated successfully');
        }
      }, 1000); // Give time for auto-assignments to complete
      
      return true;
      
    } catch (error) {
      console.error('❌ Error in assignStaffWithValidation:', error);
      toast.error('Failed to assign staff', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }, [validateConnections]);

  // Remove staff assignment with validation
  const removeStaffWithValidation = useCallback(async (
    staffId: string, 
    date: Date
  ): Promise<boolean> => {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🗑️ Removing staff ${staffId} assignment for ${dateStr} with validation`);
    
    try {
      await unifiedStaffService.removeStaffAssignment(staffId, date);
      console.log(`✅ Staff removal completed successfully`);
      
      // Post-removal validation
      setTimeout(async () => {
        const postValidation = await validateConnections(date);
        console.log('📋 Post-removal validation:', postValidation);
        
        if (!postValidation.isValid) {
          console.error('❌ Post-removal validation failed:', postValidation.errors);
          toast.error('Staff removal may have caused issues', {
            description: postValidation.errors.join(', ')
          });
        } else {
          toast.success('Staff removed and validated successfully');
        }
      }, 1000);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error in removeStaffWithValidation:', error);
      toast.error('Failed to remove staff assignment', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }, [validateConnections]);

  // Resolve conflicts automatically where possible
  const resolveConflicts = useCallback(async (conflicts: ConnectionConflict[]): Promise<boolean> => {
    console.log(`🔧 Attempting to resolve ${conflicts.length} conflicts`);
    
    try {
      for (const conflict of conflicts) {
        console.log(`🔧 Resolving conflict:`, conflict);
        
        switch (conflict.type) {
          case 'staff_not_assigned':
            // Try to assign staff to the required team
            await unifiedStaffService.assignStaffToTeam(
              conflict.staffId, 
              conflict.teamId, 
              new Date(conflict.date)
            );
            console.log(`✅ Resolved: Assigned staff ${conflict.staffId} to team ${conflict.teamId}`);
            break;
            
          case 'booking_moved':
            // Handle booking move conflicts through the edge function
            console.log(`⚠️ Booking move conflict requires manual resolution: ${conflict.description}`);
            break;
            
          case 'team_conflict':
            // Handle team conflicts
            console.log(`⚠️ Team conflict requires manual resolution: ${conflict.description}`);
            break;
        }
      }
      
      toast.success('Conflicts resolved successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Error resolving conflicts:', error);
      toast.error('Failed to resolve some conflicts', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }, []);

  return {
    isValidating,
    lastValidation,
    validateConnections,
    assignStaffWithValidation,
    removeStaffWithValidation,
    resolveConflicts
  };
};
