import React, { useState, useEffect } from 'react';
import { Resource } from './ResourceData';
import { 
  fetchStaffMembers, 
  fetchStaffAssignments, 
  assignStaffToTeam, 
  removeStaffAssignment,
  addStaffMember
} from '@/services/staffService';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TeamDropZone from './TeamDropZone';
import StaffForm from './StaffForm';
import StaffSelectionDialog from './StaffSelectionDialog';
import { StaffMember, StaffAssignment } from './StaffTypes';

// Exporting types for other components - using `export type` as required
export type { StaffMember, StaffAssignment };

// Props for the StaffAssignmentRow component
interface StaffAssignmentRowProps {
  resources: Resource[];
  currentDate: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean;
}

// Main StaffAssignmentRow component
const StaffAssignmentRow: React.FC<StaffAssignmentRowProps> = ({ 
  resources, 
  currentDate, 
  onStaffDrop,
  forceRefresh 
}) => {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  
  // State for the staff selection dialog
  const [staffSelectionOpen, setStaffSelectionOpen] = useState(false);
  const [selectedResourceForStaff, setSelectedResourceForStaff] = useState<{id: string, title: string} | null>(null);

  // Load staff members and assignments from the database
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        // Fetch staff members
        const staffData = await fetchStaffMembers();
        setStaffMembers(staffData);
        
        // Fetch assignments for the current date
        const assignmentData = await fetchStaffAssignments(currentDate);
        setAssignments(assignmentData);

        console.log('Loaded staff members:', staffData);
        console.log('Loaded assignments:', assignmentData);
      } catch (error) {
        console.error('Error loading staff data:', error);
        toast.error('Failed to load staff data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentDate, forceRefresh]);

  // Handler for adding a new staff member
  const handleAddStaff = async (name: string, email: string, phone: string) => {
    try {
      const newStaff = await addStaffMember(name, email || undefined, phone || undefined);
      
      setStaffMembers(prev => [...prev, newStaff]);
      
      // If a team was selected, assign the new staff member to it
      if (selectedTeam) {
        await assignStaffToTeam(newStaff.id, selectedTeam, currentDate);
        
        // Refresh assignments
        const assignmentData = await fetchStaffAssignments(currentDate);
        setAssignments(assignmentData);
      }
      
      toast.success(`Added ${name} to staff`);
      setStaffDialogOpen(false);
    } catch (error) {
      console.error('Error adding staff:', error);
      toast.error('Failed to add staff member');
    }
  };

  // Handler for dropping a staff member into a team column
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    try {
      // If an external onStaffDrop is provided, use that instead
      if (onStaffDrop) {
        await onStaffDrop(staffId, resourceId);
      } else {
        // Otherwise use the internal implementation
        if (resourceId) {
          // Assign staff to team
          await assignStaffToTeam(staffId, resourceId, currentDate);
          toast.success('Staff assigned to team');
        } else {
          // Remove assignment
          await removeStaffAssignment(staffId, currentDate);
          toast.success('Staff assignment removed');
        }
      }
      
      // Refresh assignments
      const assignmentData = await fetchStaffAssignments(currentDate);
      setAssignments(assignmentData);
    } catch (error) {
      console.error('Error updating staff assignment:', error);
      toast.error('Failed to update staff assignment');
    }
  };

  // Handler for adding a new staff member to a specific team
  const handleAddStaffToTeam = (resourceId: string) => {
    setSelectedTeam(resourceId);
    setStaffDialogOpen(true);
  };
  
  // Handler for selecting existing staff for a team
  const handleSelectStaffForTeam = (resourceId: string, resourceTitle: string) => {
    setSelectedResourceForStaff({id: resourceId, title: resourceTitle});
    setStaffSelectionOpen(true);
  };
  
  // Handler for refreshing the staff list after a staff member is assigned
  const handleStaffAssignmentRefresh = async () => {
    const assignmentData = await fetchStaffAssignments(currentDate);
    setAssignments(assignmentData);
  };

  // If still loading, show a loading indicator
  if (isLoading) {
    return (
      <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
        <div className="bg-gray-100 p-2 border-b border-gray-200">
          <h3 className="text-xs font-semibold">Loading Staff Assignments...</h3>
        </div>
      </div>
    );
  }

  // Main component render
  return (
    <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
      <div className="bg-gray-100 p-2 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-xs font-semibold">
          Assign Staff for {currentDate.toLocaleDateString()}
        </h3>
        <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" 
              onClick={() => {
                setSelectedTeam(null);
                setStaffDialogOpen(true);
              }}
              className="text-xs py-1 h-7"
            >
              Add New Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedTeam 
                  ? `Add Staff to ${resources.find(r => r.id === selectedTeam)?.title || 'Team'}` 
                  : 'Add New Staff Member'}
              </DialogTitle>
            </DialogHeader>
            <StaffForm 
              onSave={handleAddStaff} 
              onCancel={() => setStaffDialogOpen(false)} 
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${resources.length}, 1fr)` }}>
        {resources.map(resource => (
          <TeamDropZone
            key={resource.id}
            resource={resource}
            staffMembers={staffMembers}
            assignments={assignments}
            onDrop={handleStaffDrop}
            onAddStaff={handleAddStaffToTeam}
            onSelectStaff={handleSelectStaffForTeam}
            currentDate={currentDate}
          />
        ))}
      </div>
      
      {/* Staff Selection Dialog */}
      {selectedResourceForStaff && (
        <StaffSelectionDialog
          resourceId={selectedResourceForStaff.id}
          resourceTitle={selectedResourceForStaff.title}
          currentDate={currentDate}
          open={staffSelectionOpen}
          onOpenChange={setStaffSelectionOpen}
          onStaffAssigned={handleStaffAssignmentRefresh}
        />
      )}
    </div>
  );
};

export default StaffAssignmentRow;
