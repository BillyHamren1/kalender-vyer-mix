
import React, { useState, useEffect } from 'react';
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
import { Check, UserPlus, Users, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

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
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Get the initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Format the name for display
  const formatStaffName = (fullName: string): string => {
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0];
    
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    return `${firstName} ${lastName[0]}.`;
  };

  // Fetch available staff from the edge function
  useEffect(() => {
    const fetchAvailableStaff = async () => {
      try {
        setIsLoading(true);
        const formattedDate = currentDate.toISOString().split('T')[0];
        
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
          
          // Now fetch current assignments to mark staff that are already assigned
          try {
            const { data: assignmentsData, error: assignmentsError } = await supabase
              .from('staff_assignments')
              .select('staff_id, team_id')
              .eq('assignment_date', formattedDate);
            
            if (assignmentsError) {
              console.error('Error fetching staff assignments:', assignmentsError);
            } else if (assignmentsData) {
              // Create a list of already assigned staff IDs
              const assignedStaffIds = assignmentsData.map(a => a.staff_id);
              
              // Filter out staff that are already assigned to any team
              // We'll show them separately in the dropdown
              setAvailableStaff(staffList);
            }
          } catch (assignmentError) {
            console.error('Error in fetching assignments:', assignmentError);
          }
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

    if (isOpen) {
      fetchAvailableStaff();
    }
  }, [currentDate, isOpen]);

  // Handle staff selection from dropdown
  const handleStaffSelect = async (staff: StaffMember) => {
    try {
      // Check if staff is already assigned to this team
      const isAlreadyAssignedToThisTeam = assignedStaff.some(s => s.id === staff.id);
      
      if (isAlreadyAssignedToThisTeam) {
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
      
      // Assign staff to this team
      await onAssignStaff(staff.id, resourceId);
      
      // Close dropdown after assignment
      setIsOpen(false);
      
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    }
  };

  // Check if a staff member is already assigned to any team
  const isStaffAssigned = (staffId: string): boolean => {
    return assignedStaff.some(s => s.id === staffId);
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
          <DropdownMenuItem disabled>Loading staff...</DropdownMenuItem>
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
