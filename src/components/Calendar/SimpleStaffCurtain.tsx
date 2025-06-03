
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, X, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
}

interface SimpleStaffCurtainProps {
  currentDate: Date;
  onClose: () => void;
  onAssignStaff: (staffId: string, teamId: string) => Promise<void>;
  selectedTeamId: string | null;
  selectedTeamName: string;
  availableStaff: StaffMember[]; // Use the staff data that's already available
}

const SimpleStaffCurtain: React.FC<SimpleStaffCurtainProps> = ({ 
  currentDate, 
  onClose,
  onAssignStaff,
  selectedTeamId,
  selectedTeamName,
  availableStaff
}) => {
  const [assigning, setAssigning] = useState<string | null>(null);
  
  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  const handleAssignToTeam = async (staffId: string, staffName: string) => {
    if (!selectedTeamId) {
      toast.error('Please select a team first');
      return;
    }
    
    setAssigning(staffId);
    
    try {
      await onAssignStaff(staffId, selectedTeamId);
      toast.success(`${staffName} assigned to ${selectedTeamName}`);
      onClose(); // Close the curtain after successful assignment
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-start justify-end">
      <div className="bg-white h-full w-80 shadow-xl transform transition-transform duration-300 ease-out animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Users className="h-5 w-5" />
            Available Staff
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Team info */}
        {selectedTeamId && (
          <div className="bg-blue-50 p-3 text-sm border-b">
            <div className="font-medium text-blue-900">Assigning to:</div>
            <div className="text-blue-700">{selectedTeamName}</div>
            <div className="text-blue-600 text-xs">
              {currentDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        )}
        
        {/* Staff list */}
        <div className="flex-1 overflow-y-auto p-4">
          {availableStaff.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-3">
                {availableStaff.length} staff member{availableStaff.length !== 1 ? 's' : ''} available
              </div>
              {availableStaff.map(staff => (
                <div 
                  key={staff.id}
                  className="flex items-center justify-between p-3 border rounded-md bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar 
                      className="h-10 w-10"
                      style={{ backgroundColor: staff.color || '#E3F2FD' }}
                    >
                      <AvatarFallback 
                        className="text-sm"
                        style={{ 
                          backgroundColor: staff.color || '#E3F2FD',
                          color: '#333'
                        }}
                      >
                        {getInitials(staff.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-gray-900">{staff.name}</div>
                      {staff.email && (
                        <div className="text-xs text-gray-500">{staff.email}</div>
                      )}
                    </div>
                  </div>
                  
                  {selectedTeamId && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleAssignToTeam(staff.id, staff.name)}
                      disabled={assigning === staff.id}
                      className="ml-2"
                    >
                      {assigning === staff.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-1" />
                          Assign
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <div className="text-lg font-medium mb-1">No Staff Available</div>
              <div className="text-sm">
                No staff members are available for {currentDate.toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
        
        {!selectedTeamId && (
          <div className="p-4 border-t text-sm text-gray-500 bg-gray-50">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-orange-400 rounded-full"></div>
              Select a team first by clicking the + button next to a team name
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleStaffCurtain;
