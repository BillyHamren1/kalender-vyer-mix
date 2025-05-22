
import React, { useState, useEffect, useMemo } from 'react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from './StaffTypes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Check, UserPlus, Users, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStaffAvailability } from '@/hooks/useStaffAvailability';

interface StaffDropdownMenuProps {
  resourceId: string;
  resourceTitle: string;
  currentDate: Date;
  assignedStaff: StaffMember[];
  onAssignStaff: (staffId: string, resourceId: string) => Promise<void>;
}

const StaffDropdownMenu: React.FC<StaffDropdownMenuProps> = ({
  resourceId,
  resourceTitle,
  currentDate,
  assignedStaff,
  onAssignStaff,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { availableStaff, isLoading } = useStaffAvailability(currentDate, isOpen);

  // Format the name for display (moved to a utility function)
  const formatStaffName = (fullName: string): string => {
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0];
    
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    return `${firstName} ${lastName[0]}.`;
  };

  // Get the initials for avatar (moved to a utility function)
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Memoize whether a staff member is already assigned
  const isStaffAssigned = useMemo(() => {
    const assignedIds = assignedStaff.map(s => s.id);
    return (staffId: string) => assignedIds.includes(staffId);
  }, [assignedStaff]);

  // Handle staff selection from dropdown
  const handleStaffSelect = async (staff: StaffMember) => {
    try {
      // Check if staff is already assigned to this team
      if (isStaffAssigned(staff.id)) {
        toast.info(`${staff.name} is already assigned to ${resourceTitle}`);
        return;
      }
      
      // Check if staff is assigned to another team
      const { data: existingAssignment, error } = await supabase
        .from('staff_assignments')
        .select('team_id')
        .eq('staff_id', staff.id)
        .eq('assignment_date', currentDate.toISOString().split('T')[0])
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows returned
        console.error('Error checking existing assignment:', error);
        toast.error('Failed to check staff assignment');
        return;
      }
      
      if (existingAssignment) {
        // Confirm reassignment
        const confirm = window.confirm(
          `${staff.name} is already assigned to another team. Reassign to ${resourceTitle}?`
        );
        
        if (!confirm) return;
      }
      
      // Assign staff to this team with a loading toast
      const toastId = toast.loading(`Assigning ${staff.name} to team...`);
      await onAssignStaff(staff.id, resourceId);
      toast.dismiss(toastId);
      toast.success(`${staff.name} assigned to ${resourceTitle}`);
      
      // Close dropdown after assignment
      setIsOpen(false);
      
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-auto py-1.5 px-2 border-dashed text-xs"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          <span>Assign Staff</span>
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto" align="start">
        <DropdownMenuLabel className="flex items-center">
          <Users className="h-4 w-4 mr-2" />
          <span>Available Staff</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <DropdownMenuItem disabled className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>Loading staff...</span>
          </DropdownMenuItem>
        ) : availableStaff.length > 0 ? (
          <>
            {availableStaff.map(staff => {
              const assigned = isStaffAssigned(staff.id);
              return (
                <DropdownMenuItem
                  key={staff.id}
                  disabled={assigned}
                  onSelect={() => !assigned && handleStaffSelect(staff)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center">
                    <Avatar className="h-5 w-5 mr-2">
                      <AvatarFallback className="text-[10px]">
                        {getInitials(staff.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{formatStaffName(staff.name)}</span>
                  </div>
                  {assigned && <Check className="h-4 w-4 ml-2 text-green-600" />}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : (
          <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default StaffDropdownMenu;
