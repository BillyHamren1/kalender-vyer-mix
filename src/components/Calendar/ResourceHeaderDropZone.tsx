
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';
import { format } from 'date-fns';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate: Date;
  targetDate?: Date; // NEW: specific target date for this drop zone
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  assignedStaff?: Array<{id: string, name: string}>;
  minHeight?: number;
}

const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({
  resource,
  currentDate,
  targetDate, // NEW: Use this for operations
  onStaffDrop,
  onSelectStaff,
  assignedStaff = [],
  minHeight = 80
}) => {
  // Use targetDate if provided, otherwise fall back to currentDate
  const effectiveDate = targetDate || currentDate;
  
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff:`, assignedStaff);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'STAFF',
    drop: async (item: { id: string; name: string; assignedTeam?: string | null }) => {
      console.log(`ResourceHeaderDropZone: Staff dropped:`, {
        staffId: item.id,
        staffName: item.name,
        fromTeam: item.assignedTeam,
        toTeam: resource.id,
        resourceTitle: resource.title,
        targetDate: format(effectiveDate, 'yyyy-MM-dd')
      });
      
      if (onStaffDrop) {
        try {
          // Call the drop handler - this should trigger immediate optimistic updates
          await onStaffDrop(item.id, resource.id);
          console.log('ResourceHeaderDropZone: Staff drop completed successfully for date:', format(effectiveDate, 'yyyy-MM-dd'));
        } catch (error) {
          console.error('ResourceHeaderDropZone: Error handling staff drop:', error);
        }
      }
    },
    canDrop: (item: { id: string; assignedTeam?: string | null }) => {
      // Check if staff is already assigned to this team for this specific date
      const isAlreadyAssigned = assignedStaff.some(staff => staff.id === item.id);
      const canDropHere = !isAlreadyAssigned;
      
      console.log(`ResourceHeaderDropZone: Can drop check for ${item.id} on ${format(effectiveDate, 'yyyy-MM-dd')}:`, {
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
    console.log(`ResourceHeaderDropZone: Select staff clicked for ${resource.id} on ${format(effectiveDate, 'yyyy-MM-dd')}`);
    if (onSelectStaff) {
      onSelectStaff(resource.id, resource.title);
    } else {
      console.error('ResourceHeaderDropZone: onSelectStaff is not defined');
    }
  };

  // Handle staff removal with immediate UI feedback for the specific date
  const handleStaffRemove = async (staffId: string) => {
    console.log(`ResourceHeaderDropZone: Removing staff ${staffId} from team ${resource.id} for date ${format(effectiveDate, 'yyyy-MM-dd')}`);
    if (onStaffDrop) {
      try {
        // This should trigger immediate optimistic updates for the specific date
        await onStaffDrop(staffId, null); // null resourceId means removal
        console.log('ResourceHeaderDropZone: Staff removal completed successfully for date:', format(effectiveDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('ResourceHeaderDropZone: Error removing staff:', error);
      }
    }
  };

  // Enhanced drop zone styling with smoother transitions
  const getDropZoneClass = () => {
    let baseClass = `resource-header-drop-zone p-2 h-full w-full flex flex-col justify-between relative transition-all duration-150`;
    
    if (isOver && canDrop) {
      return `${baseClass} bg-green-100 border-2 border-green-400 shadow-lg transform scale-105`;
    } else if (isOver && !canDrop) {
      return `${baseClass} bg-red-100 border-2 border-red-400`;
    } else if (canDrop) {
      return `${baseClass} bg-blue-50 border-2 border-blue-200`;
    }
    
    return `${baseClass} bg-gray-50 border border-gray-200`;
  };

  return (
    <div
      ref={drop}
      className={getDropZoneClass()}
      style={{ minHeight: `${minHeight}px` }}
    >
      {/* Team title */}
      <div className="text-sm font-semibold text-gray-700 mb-1 text-center">
        {resource.title}
      </div>
      
      {/* Staff list - FIXED: Show ALL assigned staff */}
      <div className="flex-1 space-y-1 overflow-y-auto max-h-32">
        {assignedStaff.length > 0 ? (
          assignedStaff.map((staff) => (
            <UnifiedDraggableStaffItem
              key={staff.id}
              staff={{
                id: staff.id,
                name: staff.name,
                email: '', // Add default email if needed
                assignedTeam: resource.id
              }}
              onRemove={() => handleStaffRemove(staff.id)}
              currentDate={effectiveDate}
              teamName={resource.title}
              variant="assigned"
              showRemoveDialog={true}
            />
          ))
        ) : (
          <div className="text-xs text-gray-400 text-center py-2">
            No staff assigned
          </div>
        )}
      </div>
      
      {/* Add staff button */}
      <div className="mt-1">
        <Button
          onClick={handleSelectStaff}
          variant="outline"
          size="sm"
          className="w-full text-xs h-6"
        >
          <Users className="h-3 w-3 mr-1" />
          Add Staff
        </Button>
      </div>
      
      {/* Drop zone feedback */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 rounded">
          <div className="text-xs font-medium text-gray-700">
            {canDrop ? 'Drop to assign' : 'Already assigned'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceHeaderDropZone;
