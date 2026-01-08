import React, { useState, useEffect } from 'react';
import { StaffMember } from './StaffAssignmentRow';
import { toast } from 'sonner';
import { getAvailableStaffForDate } from '@/services/staffAvailabilityService';
import { supabase } from '@/integrations/supabase/client';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, UserPlus } from 'lucide-react';
import { format } from 'date-fns';

interface StaffSelectionDialogProps {
  resourceId: string;
  resourceTitle: string;
  currentDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffAssigned: (staffId: string, staffName: string) => Promise<void>;
  reliableStaffOperations?: {
    assignments: Array<{
      staffId: string;
      staffName: string;
      teamId: string;
      date: string;
    }>;
    getStaffForTeam: (teamId: string) => Array<{id: string, name: string}>;
    handleStaffDrop: (staffId: string, resourceId: string | null) => Promise<void>;
  };
}

// Extended interface for staff with assignment status
interface StaffWithAssignmentStatus extends StaffMember {
  assignedTeamId: string | null;
  isAssignedToCurrentTeam: boolean;
  isAssignedToOtherTeam: boolean;
}

const StaffSelectionDialog: React.FC<StaffSelectionDialogProps> = ({
  resourceId,
  resourceTitle,
  currentDate,
  open,
  onOpenChange,
  onStaffAssigned,
  reliableStaffOperations
}) => {
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<StaffWithAssignmentStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  
  // Load staff members filtered by availability for this specific date
  useEffect(() => {
    if (open) {
      const loadStaffData = async () => {
        try {
          setLoading(true);
          
          // Get staff IDs who are available on this specific date
          const availableStaffIds = await getAvailableStaffForDate(currentDate);
          
          console.log('StaffSelectionDialog: Available staff IDs for', dateStr, ':', availableStaffIds);
          
          // Fetch full staff details for available staff only
          if (availableStaffIds.length > 0) {
            const { data: staffData, error } = await supabase
              .from('staff_members')
              .select('id, name, color, email, phone')
              .in('id', availableStaffIds)
              .eq('is_active', true);
            
            if (error) throw error;
            
            setAllStaff(staffData || []);
            console.log('StaffSelectionDialog: Loaded', staffData?.length || 0, 'available staff members');
          } else {
            setAllStaff([]);
            console.log('StaffSelectionDialog: No staff available for this date');
          }
          
          if (reliableStaffOperations) {
            console.log('StaffSelectionDialog: Current reliable assignments:', reliableStaffOperations.assignments);
          }
        } catch (error) {
          console.error('Error loading staff data:', error);
          toast.error('Failed to load staff data');
        } finally {
          setLoading(false);
        }
      };
      
      loadStaffData();
    }
  }, [open, currentDate, dateStr, reliableStaffOperations]);
  
  // Filter and sort staff using reliable data
  useEffect(() => {
    if (allStaff.length && reliableStaffOperations) {
      // Create assignment map from reliable data for the specific date
      const assignedStaffMap = new Map();
      reliableStaffOperations.assignments
        .filter(assignment => assignment.date === dateStr)
        .forEach(assignment => {
          assignedStaffMap.set(assignment.staffId, assignment.teamId);
        });
      
      console.log(`StaffSelectionDialog: Assignment map for ${dateStr}:`, Object.fromEntries(assignedStaffMap));
      
      // Filter by search query
      const searchFiltered = allStaff.filter(staff => {
        if (searchQuery) {
          return staff.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
      });
      
      // Add assignment status to each staff member using reliable data
      const staffWithStatus: StaffWithAssignmentStatus[] = searchFiltered.map(staff => {
        const assignedTeamId = assignedStaffMap.get(staff.id) || null;
        const isAssignedToCurrentTeam = assignedTeamId === resourceId;
        const isAssignedToOtherTeam = assignedTeamId && assignedTeamId !== resourceId;
        
        return {
          ...staff,
          assignedTeamId,
          isAssignedToCurrentTeam,
          isAssignedToOtherTeam
        };
      });
      
      // Sort: unassigned first, then assigned to current team, then assigned to other teams
      const sorted = staffWithStatus.sort((a, b) => {
        // Unassigned staff first
        if (!a.assignedTeamId && b.assignedTeamId) return -1;
        if (a.assignedTeamId && !b.assignedTeamId) return 1;
        
        // Among assigned staff, current team assignments next
        if (a.isAssignedToCurrentTeam && !b.isAssignedToCurrentTeam) return -1;
        if (!a.isAssignedToCurrentTeam && b.isAssignedToCurrentTeam) return 1;
        
        // Finally alphabetical
        return a.name.localeCompare(b.name);
      });
      
      console.log(`StaffSelectionDialog: Processed ${sorted.length} staff with assignment status for ${resourceTitle} on ${dateStr}`);
      setFilteredStaff(sorted);
    }
  }, [allStaff, searchQuery, resourceId, resourceTitle, dateStr, reliableStaffOperations]);
  
  // Handle staff assignment - now allows moves automatically
  const handleAssignStaff = async (staffId: string, staffName: string) => {
    if (assigning) return; // Prevent double-clicks
    
    try {
      setAssigning(staffId);
      console.log(`StaffSelectionDialog: Assigning staff ${staffName} (${staffId}) to team ${resourceId} on ${dateStr}`);
      
      // No need to check for conflicts - the reliable operations will handle moves automatically
      await onStaffAssigned(staffId, staffName);
      
      console.log('StaffSelectionDialog: Assignment completed successfully');
      // Don't close the dialog - allow adding multiple staff members
      toast.success(`${staffName} added`);
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff member');
    } finally {
      setAssigning(null);
    }
  };
  
  // Get the initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };
  
  // Get team name for display
  const getTeamName = (teamId: string): string => {
    return `Team ${teamId.split('-')[1] || teamId}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Add Staff to {resourceTitle} ({format(currentDate, 'MMM d, yyyy')})
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative my-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search staff members..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        
        <div className="max-h-[300px] overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex justify-center items-center h-16">
              <p className="text-sm text-muted-foreground">Loading staff...</p>
            </div>
          ) : !reliableStaffOperations ? (
            <div className="flex justify-center items-center h-16">
              <p className="text-sm text-muted-foreground">Loading assignments...</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="flex justify-center items-center h-16">
              <p className="text-sm text-muted-foreground">No staff found</p>
            </div>
          ) : (
            <ul className="divide-y">
              {filteredStaff.map(staff => {
                const isCurrentlyAssigning = assigning === staff.id;
                const isAssignedToCurrentTeam = staff.isAssignedToCurrentTeam;
                const isAssignedToOtherTeam = staff.isAssignedToOtherTeam;
                
                return (
                  <li 
                    key={staff.id} 
                    className="flex items-center justify-between p-3 hover:bg-gray-50 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 bg-purple-100">
                        <AvatarFallback className="text-xs text-purple-700">
                          {getInitials(staff.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {staff.name}
                        </p>
                        {isAssignedToCurrentTeam && (
                          <p className="text-xs text-blue-600 font-medium">
                            Already assigned to {resourceTitle}
                          </p>
                        )}
                        {isAssignedToOtherTeam && (
                          <p className="text-xs text-orange-500">
                            Currently on {getTeamName(staff.assignedTeamId!)} - will be moved
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAssignStaff(staff.id, staff.name)}
                      disabled={isCurrentlyAssigning}
                      title={
                        isAssignedToCurrentTeam 
                          ? `Already assigned to ${resourceTitle}`
                          : isAssignedToOtherTeam 
                            ? `Move to ${resourceTitle}`
                            : `Assign to ${resourceTitle}`
                      }
                    >
                      {isCurrentlyAssigning ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StaffSelectionDialog;
