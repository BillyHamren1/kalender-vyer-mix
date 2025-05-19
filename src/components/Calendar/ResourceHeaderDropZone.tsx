
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { ArrowDown } from 'lucide-react';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
}

export const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({ 
  resource,
  onStaffDrop
}) => {
  // Create a drop zone specifically for the calendar resource header
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      if (onStaffDrop) {
        onStaffDrop(item.id, resource.id);
      }
      return { resourceId: resource.id };
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }), [resource.id, onStaffDrop]);

  return (
    <div className="resource-header-wrapper flex flex-col h-full w-full">
      {/* Team title */}
      <div className="resource-title-area font-medium text-sm mb-1">
        {resource.title}
      </div>
      
      {/* Drop zone area */}
      <div 
        ref={drop}
        className={`
          resource-drop-zone text-xs flex items-center justify-center
          border-y border-dashed p-1 rounded-sm
          ${isOver ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}
          transition-colors duration-200
        `}
        style={{ minHeight: '24px' }}
      >
        <div className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3" />
          <span className="text-xs">Drop staff</span>
        </div>
      </div>
    </div>
  );
};
