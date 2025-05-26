
import React, { useState, useEffect } from 'react';
import { fetchStaffMembers, fetchStaffAssignments, assignStaffToTeam } from '@/services/staffService';
import { StaffMember } from './StaffAssignmentRow';
import { toast } from 'sonner';
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

interface StaffSelectionDialogProps {
  resourceId: string;
  resourceTitle: string;
  currentDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffAssigned: (staffId: string, staffName: string) => Promise<void>; // Changed to return Promise
}

const StaffSelectionDialog: React.FC<StaffSelectionDialogProps> = ({
  resourceId,
  resourceTitle,
  currentDate,
  open,
  onOpenChange,
  onStaffAssigned
}) => {
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<StaffMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  
  // Load all staff and current assignments
  useEffect(() => {
    if (open) {
      const loadData = async () => {
        try {
          setLoading(true);
          // Fetch all staff members
          const staffData = await fetchStaffMembers();
          setAllStaff(staffData);
          
          // Fetch assignments for the current date
          const assignmentData = await fetchStaffAssignments(currentDate);
          setAssignments(assignmentData);
          
          console.log('StaffSelectionDialog: Loaded staff members:', staffData);
          console.log('StaffSelectionDialog: Current assignments:', assignmentData);
        } catch (error) {
          console.error('Error loading staff data:', error);
          toast.error('Failed to load staff data');
        } finally {
          setLoading(false);
        }
      };
      
      loadData();
    }
  }, [open, currentDate]);
  
  // Filter staff based on search query and current assignments
  useEffect(() => {
    if (allStaff.length) {
      // Get IDs of staff already assigned to any team on this date
      const assignedStaffIds = new Set(assignments.map(a => a.staff_id));
      
      // Filter out staff already assigned to the current resource
      const alreadyAssignedToThisTeam = new Set(
        assignments
          .filter(a => a.team_id === resourceId)
          .map(a => a.staff_id)
      );
      
      // Filter staff by search query and assignment status
      const filtered = allStaff.filter(staff => {
        // If already assigned to this team, don't show
        if (alreadyAssignedToThisTeam.has(staff.id)) {
          return false;
        }
        
        // Filter by name if search query exists
        if (searchQuery) {
          return staff.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        
        return true;
      });
      
      // Sort: unassigned staff first, then alphabetically
      const sorted = filtered.sort((a, b) => {
        const aAssigned = assignedStaffIds.has(a.id);
        const bAssigned = assignedStaffIds.has(b.id);
        
        // If one is assigned and the other isn't, put unassigned first
        if (aAssigned !== bAssigned) {
          return aAssigned ? 1 : -1;
        }
        
        // Otherwise sort alphabetically
        return a.name.localeCompare(b.name);
      });
      
      setFilteredStaff(sorted);
    }
  }, [allStaff, assignments, searchQuery, resourceId]);
  
  // Handle staff assignment with proper async handling
  const handleAssignStaff = async (staffId: string, staffName: string) => {
    if (assigning) return; // Prevent double-clicks
    
    try {
      setAssigning(staffId);
      console.log(`StaffSelectionDialog: Assigning staff ${staffName} (${staffId}) to team ${resourceId}`);
      
      // First, make the API call to assign staff
      await assignStaffToTeam(staffId, resourceId, currentDate);
      
      console.log('StaffSelectionDialog: API assignment successful, calling callback');
      
      // Then call the callback and wait for it to complete
      await onStaffAssigned(staffId, staffName);
      
      console.log('StaffSelectionDialog: Callback completed successfully');
      
      toast.success(`${staffName} assigned to ${resourceTitle} successfully`);
      onOpenChange(false);
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
  
  // Check if staff is already assigned to another team
  const isAssignedElsewhere = (staffId: string): boolean => {
    return assignments.some(a => a.staff_id === staffId && a.team_id !== resourceId);
  };
  
  // Get team name for a staff member if assigned elsewhere
  const getAssignedTeamName = (staffId: string): string => {
    const assignment = assignments.find(a => a.staff_id === staffId);
    if (!assignment) return '';
    return `Team ${assignment.team_id.split('-')[1]}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Add Staff to {resourceTitle}
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
          ) : filteredStaff.length === 0 ? (
            <div className="flex justify-center items-center h-16">
              <p className="text-sm text-muted-foreground">No available staff found</p>
            </div>
          ) : (
            <ul className="divide-y">
              {filteredStaff.map(staff => {
                const alreadyAssigned = isAssignedElsewhere(staff.id);
                const assignedTeam = alreadyAssigned ? getAssignedTeamName(staff.id) : null;
                const isCurrentlyAssigning = assigning === staff.id;
                
                return (
                  <li 
                    key={staff.id} 
                    className={`flex items-center justify-between p-3 hover:bg-gray-50 ${alreadyAssigned ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 bg-purple-100">
                        <AvatarFallback className="text-xs text-purple-700">
                          {getInitials(staff.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{staff.name}</p>
                        {alreadyAssigned && (
                          <p className="text-xs text-muted-foreground">
                            Assigned to {assignedTeam}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAssignStaff(staff.id, staff.name)}
                      disabled={alreadyAssigned || isCurrentlyAssigning}
                      title={alreadyAssigned ? `Already assigned to ${assignedTeam}` : `Assign to ${resourceTitle}`}
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
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StaffSelectionDialog;
