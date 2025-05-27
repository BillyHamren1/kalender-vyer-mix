
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Plus } from 'lucide-react';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';
import { format } from 'date-fns';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate: Date;
  targetDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  assignedStaff?: Array<{id: string, name: string}>;
  minHeight?: number;
}

const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({
  resource,
  currentDate,
  targetDate,
  onStaffDrop,
  onSelectStaff,
  assignedStaff = [],
  minHeight = 80
}) => {
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
          await onStaffDrop(item.id, resource.id);
          console.log('ResourceHeaderDropZone: Staff drop completed successfully for date:', format(effectiveDate, 'yyyy-MM-dd'));
        } catch (error) {
          console.error('ResourceHeaderDropZone: Error handling staff drop:', error);
        }
      }
    },
    canDrop: (item: { id: string; assignedTeam?: string | null }) => {
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

  const handleStaffRemove = async (staffId: string) => {
    console.log(`ResourceHeaderDropZone: Removing staff ${staffId} from team ${resource.id} for date ${format(effectiveDate, 'yyyy-MM-dd')}`);
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, null);
        console.log('ResourceHeaderDropZone: Staff removal completed successfully for date:', format(effectiveDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('ResourceHeaderDropZone: Error removing staff:', error);
      }
    }
  };

  const getDropZoneClass = () => {
    let baseClass = `staff-drop-zone p-2 h-full w-full flex flex-col transition-all duration-150`;
    
    if (isOver && canDrop) {
      return `${baseClass} bg-green-100 border-2 border-green-400 shadow-lg`;
    } else if (isOver && !canDrop) {
      return `${baseClass} bg-red-100 border-2 border-red-400`;
    } else if (canDrop) {
      return `${baseClass} bg-blue-50 border-2 border-blue-200`;
    }
    
    return `${baseClass} bg-gray-50 border border-gray-200`;
  };

  return (
    <div className="w-full">
      {/* Team header - separate container */}
      <div className="bg-gray-100 border border-gray-200 border-b-0 rounded-t-md p-3 relative">
        <div className="text-sm font-semibold text-gray-700 text-center pr-6">
          {resource.title}
        </div>
        
        {/* System-styled add button */}
        <button
          onClick={handleSelectStaff}
          className="absolute top-2 right-2 w-6 h-6 border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-800 rounded flex items-center justify-center text-xs transition-colors shadow-sm"
          title="Assign staff"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Staff assignment area - direct drop zone without container */}
      <div
        ref={drop}
        className={getDropZoneClass()}
        style={{ minHeight: `${minHeight}px` }}
      >
        {/* Staff items - directly placed without wrapper container */}
        {assignedStaff.map((staff) => (
          <UnifiedDraggableStaffItem
            key={staff.id}
            staff={{
              id: staff.id,
              name: staff.name,
              email: '',
              assignedTeam: resource.id
            }}
            onRemove={() => handleStaffRemove(staff.id)}
            currentDate={effectiveDate}
            teamName={resource.title}
            variant="assigned"
            showRemoveDialog={true}
          />
        ))}
        
        {/* Drop zone feedback */}
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 rounded">
            <div className="text-xs font-medium text-gray-700">
              {canDrop ? 'Drop to assign' : 'Already assigned'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceHeaderDropZone;
