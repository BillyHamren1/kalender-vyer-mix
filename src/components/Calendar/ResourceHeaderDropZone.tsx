
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import DraggableStaffItem from './DraggableStaffItem';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  assignedStaff?: Array<{id: string, name: string}>;
  minHeight?: number;
}

const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({
  resource,
  currentDate,
  onStaffDrop,
  onSelectStaff,
  assignedStaff = [],
  minHeight = 80
}) => {
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff, minHeight: ${minHeight}`);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'STAFF',
    drop: async (item: { id: string; name: string; assignedTeam?: string | null }) => {
      console.log(`ResourceHeaderDropZone: Staff dropped:`, {
        staffId: item.id,
        staffName: item.name,
        fromTeam: item.assignedTeam,
        toTeam: resource.id,
        resourceTitle: resource.title
      });
      
      if (onStaffDrop) {
        try {
          await onStaffDrop(item.id, resource.id);
          console.log('ResourceHeaderDropZone: Staff drop completed successfully');
        } catch (error) {
          console.error('ResourceHeaderDropZone: Error handling staff drop:', error);
        }
      }
    },
    canDrop: (item: { id: string; assignedTeam?: string | null }) => {
      // Check if staff is already assigned to this team
      const isAlreadyAssigned = assignedStaff.some(staff => staff.id === item.id);
      const canDropHere = !isAlreadyAssigned;
      
      console.log(`ResourceHeaderDropZone: Can drop check for ${item.id}:`, {
        isAlreadyAssigned,
        canDropHere,
        targetTeam: resource.id
      });
      
      return canDropHere;
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  });

  const handleSelectStaff = () => {
    console.log(`ResourceHeaderDropZone: Select staff clicked for ${resource.id}`);
    if (onSelectStaff) {
      onSelectStaff(resource.id, resource.title);
    } else {
      console.error('ResourceHeaderDropZone: onSelectStaff is not defined');
    }
  };

  // Handle staff removal
  const handleStaffRemove = async (staffId: string) => {
    console.log(`ResourceHeaderDropZone: Removing staff ${staffId} from team ${resource.id}`);
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, null); // null resourceId means removal
        console.log('ResourceHeaderDropZone: Staff removal completed successfully');
      } catch (error) {
        console.error('ResourceHeaderDropZone: Error removing staff:', error);
      }
    }
  };

  // Get drop zone styling with better visual feedback
  const getDropZoneClass = () => {
    let baseClass = `resource-header-drop-zone p-2 h-full w-full flex flex-col justify-between relative transition-all duration-200`;
    
    if (isOver && canDrop) {
      return `${baseClass} bg-green-100 border-2 border-green-400 shadow-lg`;
    } else if (isOver && !canDrop) {
      return `${baseClass} bg-red-100 border-2 border-red-400`;
    } else {
      return `${baseClass} bg-gray-50 hover:bg-gray-100`;
    }
  };

  return (
    <div
      ref={drop}
      className={getDropZoneClass()}
      style={{ 
        width: '80px',
        minWidth: '80px', 
        maxWidth: '80px',
        minHeight: `${minHeight}px`,
        height: `${minHeight}px`,
        overflow: 'visible',
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Team Header with Title and Staff Button */}
      <div className="flex flex-col">
        {/* Team Title */}
        <div className="text-xs font-medium text-center mb-1 truncate" title={resource.title}>
          {resource.title}
        </div>
        
        {/* Select Staff Button - Always visible */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectStaff}
          className="h-6 w-full text-xs p-1 mb-1"
          title="Select staff for this team"
        >
          <Users className="h-3 w-3" />
        </Button>
      </div>
      
      {/* Staff Section - shows assigned staff using DraggableStaffItem */}
      <div className="staff-section flex-1 min-h-0">
        {assignedStaff.length > 0 ? (
          <div className="space-y-1">
            {assignedStaff.map((staff) => (
              <DraggableStaffItem
                key={staff.id}
                staff={staff}
                onRemove={() => handleStaffRemove(staff.id)}
                currentDate={currentDate}
                teamName={resource.title}
              />
            ))}
          </div>
        ) : null}
      </div>
      
      {/* Drop feedback overlay */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`text-xs font-medium px-2 py-1 rounded ${
            canDrop 
              ? 'bg-green-200 text-green-800' 
              : 'bg-red-200 text-red-800'
          }`}>
            {canDrop ? 'Drop here' : 'Already assigned'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceHeaderDropZone;
