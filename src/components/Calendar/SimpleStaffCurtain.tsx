import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, X, UserPlus, ArrowRightLeft, Check } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

export interface StaffWithStatus {
  id: string;
  name: string;
  color?: string;
  assignmentStatus: 'free' | 'assigned_current_team' | 'assigned_other_team';
  assignedTeamId?: string;
  assignedTeamName?: string;
}

interface SimpleStaffCurtainProps {
  currentDate: Date;
  onClose: () => void;
  onAssignStaff: (staffId: string, teamId: string) => Promise<void>;
  selectedTeamId: string | null;
  selectedTeamName: string;
  staffList: StaffWithStatus[];
  position: { top: number; left: number };
}

const SimpleStaffCurtain: React.FC<SimpleStaffCurtainProps> = ({ 
  currentDate, 
  onClose,
  onAssignStaff,
  selectedTeamId,
  selectedTeamName,
  staffList,
  position
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
      // Don't close - allow adding multiple staff
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    } finally {
      setAssigning(null);
    }
  };

  // Count stats
  const freeCount = staffList.filter(s => s.assignmentStatus === 'free').length;
  const assignedOtherCount = staffList.filter(s => s.assignmentStatus === 'assigned_other_team').length;
  const assignedCurrentCount = staffList.filter(s => s.assignmentStatus === 'assigned_current_team').length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose}></div>
      
      {/* Compact Staff Curtain */}
      <div 
        className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-72 max-h-96 overflow-hidden animate-slide-in-right"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {/* Header */}
        <div className="p-3 border-b bg-primary text-primary-foreground flex justify-between items-center">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Add to {selectedTeamName}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/15"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Staff list */}
        <div className="max-h-72 overflow-y-auto">
          {staffList.length > 0 ? (
            <div className="p-2">
              <div className="text-xs text-gray-600 mb-2 px-1">
                {staffList.length} staff ({freeCount} free{assignedOtherCount > 0 ? `, ${assignedOtherCount} on other teams` : ''}{assignedCurrentCount > 0 ? `, ${assignedCurrentCount} here` : ''})
              </div>
              {staffList.map(staff => (
                <div 
                  key={staff.id}
                  className={`flex items-center justify-between p-2 rounded transition-colors ${
                    staff.assignmentStatus === 'assigned_current_team' 
                      ? 'bg-blue-50' 
                      : staff.assignmentStatus === 'assigned_other_team'
                        ? 'bg-orange-50 hover:bg-orange-100'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar 
                      className="h-6 w-6 flex-shrink-0"
                      style={{ backgroundColor: staff.color || '#E3F2FD' }}
                    >
                      <AvatarFallback 
                        className="text-xs"
                        style={{ 
                          backgroundColor: staff.color || '#E3F2FD',
                          color: '#333'
                        }}
                      >
                        {getInitials(staff.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-900 truncate">{staff.name}</div>
                      {staff.assignmentStatus === 'assigned_current_team' && (
                        <div className="text-[10px] text-blue-600">Already on this team</div>
                      )}
                      {staff.assignmentStatus === 'assigned_other_team' && (
                        <div className="text-[10px] text-orange-600">On {staff.assignedTeamName}</div>
                      )}
                    </div>
                  </div>
                  
                  {staff.assignmentStatus === 'assigned_current_team' ? (
                    <div className="h-6 w-6 flex items-center justify-center text-blue-600">
                      <Check className="h-4 w-4" />
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleAssignToTeam(staff.id, staff.name)}
                      disabled={assigning === staff.id}
                      className={`h-6 px-2 text-xs flex-shrink-0 ${
                        staff.assignmentStatus === 'assigned_other_team' 
                          ? 'border-orange-300 text-orange-700 hover:bg-orange-100' 
                          : ''
                      }`}
                    >
                      {assigning === staff.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-primary"></div>
                      ) : staff.assignmentStatus === 'assigned_other_team' ? (
                        <>
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          Move
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3 w-3 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-6 px-4">
              <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <div className="text-sm font-medium mb-1">No Staff Found</div>
              <div className="text-xs">
                No staff members in the system
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SimpleStaffCurtain;
