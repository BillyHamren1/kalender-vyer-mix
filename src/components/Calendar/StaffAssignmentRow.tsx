
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
import { Users } from 'lucide-react';

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
  currentDate: Date;
}> = ({ resource, staffMembers, assignments, onDrop, onAddStaff, currentDate }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      console.log('Staff dropped on team:', resource.title, item);
      onDrop(item.id, resource.id);
    },
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
      
      <button 
        className="w-full mt-2 text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
        onClick={() => onAddStaff(resource.id)}
      >
        + Add Staff
      </button>
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
  const [isInIframe, setIsInIframe] = useState(false);

  // Detect if in iframe
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    console.log('StaffAssignmentRow running in iframe:', window.self !== window.top);
  }, []);

  // Handle messages from parent if in iframe
  useEffect(() => {
    if (isInIframe) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'STAFF_ASSIGNMENTS_DATA') {
          console.log('Received staff assignments via postMessage:', event.data);
          if (event.data.staffMembers) setStaffMembers(event.data.staffMembers);
          if (event.data.assignments) setAssignments(event.data.assignments);
          setIsLoading(false);
        }
      };

      window.addEventListener('message', handleMessage);
      
      // Request data from parent
      try {
        window.parent.postMessage({ 
          type: 'READY_FOR_STAFF_ASSIGNMENTS', 
          date: currentDate.toISOString() 
        }, '*');
        console.log('Sent READY_FOR_STAFF_ASSIGNMENTS message to parent');
      } catch (e) {
        console.error('Error sending message to parent:', e);
      }

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }
  }, [isInIframe, currentDate]);

  // Load staff members and assignments from the database
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading staff data, isInIframe:', isInIframe);
        if (isInIframe) {
          // In iframe mode, we'll get data via postMessage
          console.log('In iframe - waiting for staff data from parent window');
          return;
        }

        setIsLoading(true);
        console.log('Fetching staff members and assignments for date:', currentDate.toISOString());
        
        // Fetch staff members
        const staffData = await fetchStaffMembers();
        setStaffMembers(staffData);
        console.log('Loaded staff members:', staffData.length);
        
        // Fetch assignments for the current date
        const assignmentData = await fetchStaffAssignments(currentDate);
        setAssignments(assignmentData);
        console.log('Loaded assignments:', assignmentData.length);

      } catch (error) {
        console.error('Error loading staff data:', error);
        toast.error('Failed to load staff data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentDate, forceRefresh, isInIframe]);

  // Handler for adding a new staff member
  const handleAddStaff = async (name: string, email: string, phone: string) => {
    try {
      console.log('Adding new staff member:', name);
      const newStaff = await addStaffMember(name, email || undefined, phone || undefined);
      
      setStaffMembers(prev => [...prev, newStaff]);
      
      // If a team was selected, assign the new staff member to it
      if (selectedTeam) {
        console.log('Assigning new staff to team:', selectedTeam);
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
      console.log(`Staff drop handler called: staffId=${staffId}, resourceId=${resourceId || 'null'}`);
      
      // If an external onStaffDrop is provided, use that instead
      if (onStaffDrop) {
        console.log('Using external onStaffDrop handler');
        await onStaffDrop(staffId, resourceId);
      } else {
        // Otherwise use the internal implementation
        if (resourceId) {
          // Assign staff to team
          console.log(`Assigning staff ${staffId} to team ${resourceId}`);
          await assignStaffToTeam(staffId, resourceId, currentDate);
          toast.success('Staff assigned to team');
        } else {
          // Remove assignment
          console.log(`Removing assignment for staff ${staffId}`);
          await removeStaffAssignment(staffId, currentDate);
          toast.success('Staff assignment removed');
        }
      }
      
      if (!isInIframe) {
        // Only refresh assignments directly if not in iframe
        console.log('Refreshing assignments after staff drop');
        const assignmentData = await fetchStaffAssignments(currentDate);
        setAssignments(assignmentData);
      } else {
        // In iframe, signal to parent that assignments changed
        try {
          window.parent.postMessage({ 
            type: 'STAFF_ASSIGNMENT_CHANGED',
            staffId,
            resourceId,
            date: currentDate.toISOString()
          }, '*');
          console.log('Sent STAFF_ASSIGNMENT_CHANGED message to parent');
        } catch (e) {
          console.error('Error sending message to parent:', e);
        }
      }
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
          Assign Staff for {currentDate.toLocaleDateString()} {isInIframe ? '(iframe mode)' : ''}
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
            currentDate={currentDate}
          />
        ))}
      </div>
    </div>
  );
};

export default StaffAssignmentRow;
