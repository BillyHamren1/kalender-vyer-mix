
import React, { useState, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from './StaffTypes';
import { syncStaffMember } from '@/services/staffService';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users } from 'lucide-react';

// Draggable staff item component
const DraggableStaffItem: React.FC<{ 
  staff: StaffMember & { assignedTeam?: string | null }
}> = ({ staff }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: staff,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  // Get the initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Format the name for display
  const displayName = staff.name.split(' ')[0];

  // Style based on assignment status
  const isAssigned = !!staff.assignedTeam;
  
  return (
    <div
      ref={drag}
      className={`p-1 mb-1 border rounded-md shadow-sm cursor-move flex items-center gap-1 ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${
        isAssigned ? 'bg-gray-100 opacity-60' : 'bg-white'
      }`}
      style={{ height: '28px' }}
      title={isAssigned ? `Assigned to team` : undefined}
    >
      <Avatar className={`h-4 w-4 ${isAssigned ? 'bg-gray-200' : 'bg-purple-100'}`}>
        <AvatarFallback className={`text-[10px] ${isAssigned ? 'text-gray-500' : 'text-purple-700'}`}>
          {getInitials(staff.name)}
        </AvatarFallback>
      </Avatar>
      <span className={`text-xs font-medium truncate ${isAssigned ? 'text-gray-500' : ''}`}>{displayName}</span>
      {isAssigned && (
        <span className="text-xs text-gray-400 ml-auto mr-1">
          &#10003;
        </span>
      )}
    </div>
  );
};

// Main component
interface AvailableStaffDisplayProps {
  currentDate: Date;
  onStaffDrop: (staffId: string, resourceId: string | null) => Promise<void>;
}

const AvailableStaffDisplay: React.FC<AvailableStaffDisplayProps> = ({ currentDate, onStaffDrop }) => {
  const [availableStaff, setAvailableStaff] = useState<(StaffMember & { assignedTeam?: string | null })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        
        console.log('Fetched staff data:', data);
        
        if (data && data.success && data.data) {
          // Transform the data into StaffMember format
          const staffList: (StaffMember & { assignedTeam?: string | null })[] = [];
          
          // Process each staff member and ensure they exist in our database
          for (const externalStaff of data.data) {
            if (externalStaff.isavailable) {
              try {
                // Sync the staff member to our database with correct signature
                await syncStaffMember({
                  id: externalStaff.id,
                  name: externalStaff.name,
                  email: externalStaff.email || undefined,
                  phone: externalStaff.phone || undefined
                });
                
                // Add to our available staff list
                staffList.push({
                  id: externalStaff.id,
                  name: externalStaff.name,
                  email: externalStaff.email || undefined,
                  phone: externalStaff.phone || undefined,
                  assignedTeam: null // Initially no team assigned
                });
              } catch (syncError) {
                console.error(`Error syncing staff member ${externalStaff.id}:`, syncError);
                toast.error(`Failed to sync staff member: ${externalStaff.name}`);
              }
            }
          }
          
          // Now fetch current assignments to mark staff that are already assigned
          try {
            const formattedDate = currentDate.toISOString().split('T')[0];
            const { data: assignmentsData, error: assignmentsError } = await supabase
              .from('staff_assignments')
              .select('staff_id, team_id')
              .eq('assignment_date', formattedDate);
            
            if (assignmentsError) {
              console.error('Error fetching staff assignments:', assignmentsError);
            } else if (assignmentsData) {
              // Update the staff list with assignment information
              for (const assignment of assignmentsData) {
                const staffIndex = staffList.findIndex(staff => staff.id === assignment.staff_id);
                if (staffIndex !== -1) {
                  staffList[staffIndex].assignedTeam = assignment.team_id;
                }
              }
            }
          } catch (assignmentError) {
            console.error('Error in fetching assignments:', assignmentError);
          }
          
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
  }, [currentDate]);

  return (
    <Card className="border border-gray-200" style={{ height: 'calc(100vh - 190px)', display: 'flex', flexDirection: 'column' }}>
      <CardHeader className="pb-1 pt-2">
        <CardTitle className="text-sm flex items-center gap-1">
          <Users className="h-4 w-4" />
          Available Staff
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto">
        {isLoading ? (
          // Show skeletons while loading
          <>
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
          </>
        ) : availableStaff.length > 0 ? (
          // Show available staff members in a vertical list
          availableStaff.map(staff => (
            <DraggableStaffItem key={staff.id} staff={staff} />
          ))
        ) : (
          // Show message when no staff available
          <div className="text-gray-500 text-center py-2 text-xs">
            No staff available for this date
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailableStaffDisplay;
