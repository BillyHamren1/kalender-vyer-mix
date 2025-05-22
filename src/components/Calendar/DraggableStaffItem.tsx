
import React from 'react';
import { useDrag } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, User } from 'lucide-react';

// Generate a unique color based on staff ID (copied from ResourceHeaderDropZone)
const getStaffColor = (staffId: string): { bg: string, border: string, text: string } => {
  // Create a simple hash from the staff ID
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) {
    hash = staffId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // List of pleasant pastel background colors
  const bgColors = [
    'bg-purple-100', 'bg-blue-100', 'bg-green-100', 
    'bg-yellow-100', 'bg-pink-100', 'bg-indigo-100', 
    'bg-red-100', 'bg-orange-100', 'bg-teal-100', 
    'bg-cyan-100'
  ];
  
  // Matching border colors
  const borderColors = [
    'border-purple-300', 'border-blue-300', 'border-green-300', 
    'border-yellow-300', 'border-pink-300', 'border-indigo-300', 
    'border-red-300', 'border-orange-300', 'border-teal-300', 
    'border-cyan-300'
  ];

  // Text colors that work well on each background
  const textColors = [
    'text-purple-800', 'text-blue-800', 'text-green-800', 
    'text-yellow-800', 'text-pink-800', 'text-indigo-800', 
    'text-red-800', 'text-orange-800', 'text-teal-800', 
    'text-cyan-800'
  ];
  
  // Use the hash to select a color
  const index = Math.abs(hash) % bgColors.length;
  
  return {
    bg: bgColors[index],
    border: borderColors[index],
    text: textColors[index]
  };
};

// Helper function to get initials for avatar
const getInitials = (name: string): string => {
  const nameParts = name.trim().split(' ');
  if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
  return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
};

interface DraggableStaffItemProps {
  staff: StaffMember;
  onRemove: () => void;
  currentDate?: Date;
}

const DraggableStaffItem: React.FC<DraggableStaffItemProps> = ({ 
  staff, 
  onRemove,
  currentDate 
}) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: { ...staff },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  // Get unique color for this staff member
  const staffColor = getStaffColor(staff.id);

  return (
    <div
      ref={drag}
      className={`flex items-center justify-between bg-white border ${staffColor.border} rounded-md p-1.5 mb-1 ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } transition-opacity cursor-move shadow-sm`}
    >
      <div className="flex items-center space-x-2">
        <Avatar className={`h-6 w-6 ${staffColor.bg}`}>
          <AvatarFallback className={`text-xs ${staffColor.text}`}>
            {getInitials(staff.name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm text-gray-800 font-medium">
          {staff.name}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-gray-400 hover:text-red-500"
        aria-label="Remove staff"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default DraggableStaffItem;
