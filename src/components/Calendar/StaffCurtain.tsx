
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, X, UserPlus } from 'lucide-react';
import { StaffMember } from './StaffTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { syncStaffMember } from '@/services/staffService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface StaffCurtainProps {
  currentDate: Date;
  onSelectStaff: (teamId: string, teamName: string) => void;
  onClose: () => void;
  onAssignStaff: (staffId: string, teamId: string) => Promise<void>;
}

const StaffCurtain: React.FC<StaffCurtainProps> = ({ 
  currentDate, 
  onSelectStaff, 
  onClose,
  onAssignStaff
}) => {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  
  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Fetch available staff
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
          const staffList: StaffMember[] = [];
          
          // Process each staff member and ensure they exist in our database
          for (const externalStaff of data.data) {
            if (externalStaff.isavailable) {
              try {
                // Sync the staff member to our database
                await syncStaffMember(
                  externalStaff.id,
                  externalStaff.name,
                  externalStaff.email || undefined,
                  externalStaff.phone || undefined
                );
                
                // Add to our available staff list
                staffList.push({
                  id: externalStaff.id,
                  name: externalStaff.name,
                  email: externalStaff.email || undefined,
                  phone: externalStaff.phone || undefined
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
              const updatedStaffList = staffList.map(staff => {
                const assignment = assignmentsData.find(a => a.staff_id === staff.id);
                return {
                  ...staff,
                  assignedTeam: assignment ? assignment.team_id : null
                };
              });
              setAvailableStaff(updatedStaffList);
            } else {
              setAvailableStaff(staffList);
            }
          } catch (assignmentError) {
            console.error('Error in fetching assignments:', assignmentError);
            setAvailableStaff(staffList);
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

    fetchAvailableStaff();
  }, [currentDate]);

  const handleAssignToTeam = async (staffId: string) => {
    if (!selectedTeamId) {
      toast.error('Please select a team first');
      return;
    }
    
    try {
      await onAssignStaff(staffId, selectedTeamId);
      
      // Update local state to reflect the assignment
      setAvailableStaff(prev => 
        prev.map(staff => 
          staff.id === staffId 
            ? { ...staff, assignedTeam: selectedTeamId } 
            : staff
        )
      );
      
      toast.success(`Staff assigned to ${selectedTeamName}`);
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    }
  };

  const openTeamSelection = (teamId: string, teamName: string) => {
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName);
    onSelectStaff(teamId, teamName);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end">
      <div className="bg-white h-full w-64 shadow-lg flex flex-col">
        <div className="p-3 border-b flex justify-between items-center bg-gray-50">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Available Staff
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {selectedTeamId && (
          <div className="bg-blue-50 p-2 text-xs border-b flex items-center justify-between">
            <span>Assigning to: <strong>{selectedTeamName}</strong></span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSelectedTeamId(null);
                setSelectedTeamName('');
              }}
              className="h-5 w-5 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2 mb-1 border rounded-md">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          ) : availableStaff.length > 0 ? (
            availableStaff.map(staff => {
              const isAssigned = !!staff.assignedTeam;
              
              return (
                <div 
                  key={staff.id}
                  className={`
                    flex items-center justify-between p-2 mb-1 border rounded-md
                    ${isAssigned ? 'bg-gray-50 opacity-60' : 'bg-white'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className={`h-6 w-6 ${isAssigned ? 'bg-gray-200' : 'bg-purple-100'}`}>
                      <AvatarFallback className={`text-[10px] ${isAssigned ? 'text-gray-500' : 'text-purple-700'}`}>
                        {getInitials(staff.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium">{staff.name}</div>
                  </div>
                  
                  {isAssigned ? (
                    <div className="text-xs text-gray-500">Assigned</div>
                  ) : selectedTeamId ? (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleAssignToTeam(staff.id)}
                      className="h-6 w-6 p-0"
                    >
                      <UserPlus className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-500 p-4">
              No staff available for this date
            </div>
          )}
        </div>
        
        {!selectedTeamId && (
          <div className="p-3 border-t text-xs text-gray-500 bg-gray-50">
            Select a team first by clicking "Select" on any team to assign staff
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffCurtain;
