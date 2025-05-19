
import React, { useState, useEffect } from 'react';
import { Resource } from './ResourceData';
import { useDrag, useDrop } from 'react-dnd';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, UserPlus } from 'lucide-react';
import StaffSelectionDialog from './StaffSelectionDialog';

// Interface for a staff member - export this type to share with AvailableStaffDisplay
export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  assignedTeam?: string | null;
}

// Interface for a staff assignment
interface StaffAssignment {
  id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  staff_members?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

// Helper function to format staff name
const formatStaffName = (fullName: string): string => {
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) return nameParts[0];
  
  const firstName = nameParts[0];
  const lastNameInitial = nameParts[nameParts.length - 1][0];
  
  return `${firstName} ${lastNameInitial}`;
};

// Props for the StaffAssignmentRow component
interface StaffAssignmentRowProps {
  resources: Resource[];
  currentDate: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean;
}

// Component for draggable staff item
const DraggableStaffItem: React.FC<{ 
  staff: StaffMember; 
  onRemove: () => void;
  currentDate: Date;
}> = ({ staff, onRemove, currentDate }) => {
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
  const displayName = formatStaffName(staff.name);

  return (
    <div
      ref={drag}
      className={`p-1 bg-white border border-gray-200 rounded-md mb-1 cursor-move flex justify-between items-center ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
      style={{ width: '95px', height: '24px' }}
    >
      <div className="flex items-center gap-1">
        <Avatar className="h-4 w-4 bg-purple-100">
          <AvatarFallback className="text-[10px] text-purple-700">
            {getInitials(staff.name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium truncate">{displayName}</span>
      </div>
      <button 
        onClick={onRemove}
        className="text-gray-400 hover:text-red-500 text-xs ml-1"
        aria-label="Remove assignment"
      >
        &times;
      </button>
    </div>
  );
};

// Component for the team column drop target
const TeamDropZone: React.FC<{ 
  resource: Resource; 
  staffMembers: StaffMember[]; 
  assignments: StaffAssignment[];
  onDrop: (staffId: string, resourceId: string | null) => void;
  onAddStaff: (resourceId: string) => void;
  onSelectStaff: (resourceId: string, resourceTitle: string) => void;
  currentDate: Date;
}> = ({ resource, staffMembers, assignments, onDrop, onAddStaff, onSelectStaff, currentDate }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => onDrop(item.id, resource.id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  // Find staff members assigned to this team
  const teamAssignments = assignments.filter(assignment => assignment.team_id === resource.id);
  const teamStaff = teamAssignments.map(assignment => {
    const staffMember = staffMembers.find(staff => staff.id === assignment.staff_id);
    return staffMember ? {
      ...staffMember,
      assignedTeam: resource.id
    } : null;
  }).filter(Boolean) as StaffMember[];

  return (
    <div 
      ref={drop}
      className={`p-2 border-r border-gray-200 h-full ${isOver ? 'bg-blue-50' : 'bg-gray-50'}`}
    >
      <div className="text-sm font-medium mb-2 flex items-center gap-1">
        <Users className="h-4 w-4" />
        <span>{resource.title}</span>
      </div>
      
      {teamStaff.map(staff => (
        <DraggableStaffItem 
          key={staff.id} 
          staff={staff}
          onRemove={() => onDrop(staff.id, null)}
          currentDate={currentDate}
        />
      ))}
      
      <div className="flex flex-col gap-1 mt-2">
        <button 
          className="w-full text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded flex items-center justify-center gap-1"
          onClick={() => onSelectStaff(resource.id, resource.title)}
        >
          <UserPlus className="h-3 w-3" />
          <span>Select Staff</span>
        </button>
        <button 
          className="w-full text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
          onClick={() => onAddStaff(resource.id)}
        >
          + Add New Staff
        </button>
      </div>
    </div>
  );
};

// Staff form component for adding/editing staff
const StaffForm: React.FC<{
  onSave: (name: string, email: string, phone: string) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    onSave(name, email, phone);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Full name" 
          required 
        />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input 
          id="email" 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="Email address" 
        />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input 
          id="phone" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          placeholder="Phone number" 
        />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save Staff</Button>
      </div>
    </form>
  );
};

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
  
  // New state for the staff selection dialog
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
