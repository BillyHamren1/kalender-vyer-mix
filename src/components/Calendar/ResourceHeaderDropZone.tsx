
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Plus } from 'lucide-react';
import DraggableStaffItem from './DraggableStaffItem';
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
  
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff, target date: ${format(effectiveDate, 'yyyy-MM-dd')}, minHeight: ${minHeight}`);

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
      return `${baseClass} bg-red-100 border-2 border-red-400 transform scale-105`;
    } else {
      return `${baseClass} bg-gray-50 hover:bg-gray-100`;
    }
  };

  // Calculate dynamic height based on number of staff members
  const calculateHeight = () => {
    const baseHeight = 35; // Further reduced for tighter layout
    const staffItemHeight = 32; // Height per staff item
    const padding = 4; // Reduced padding for tighter spacing
    const calculatedHeight = baseHeight + (assignedStaff.length * staffItemHeight) + padding;
    return Math.max(minHeight, calculatedHeight);
  };

  const dynamicHeight = calculateHeight();

  return (
    <div
      ref={drop}
      className={getDropZoneClass()}
      style={{ 
        width: '80px',
        minWidth: '80px', 
        maxWidth: '80px',
        minHeight: `${dynamicHeight}px`,
        height: 'auto',
        overflow: 'visible',
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Team Header Section with border */}
      <div className="flex flex-col border-b border-gray-200 pb-1 mb-1">
        {/* Clickable Team Title with Plus Icon */}
        <div 
          className="flex items-center justify-center gap-1 text-xs font-medium text-center cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 p-1 rounded border border-transparent hover:border-blue-200" 
          title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
          onClick={handleSelectStaff}
        >
          <span className="truncate flex-1">{resource.title}</span>
          <Plus className="h-3 w-3 flex-shrink-0" />
        </div>
      </div>
      
      {/* Staff Section - closer to events with reduced spacing */}
      <div className="staff-section flex-1 min-h-0">
        {assignedStaff.length > 0 ? (
          <div className="space-y-0.5">
            {assignedStaff.map((staff) => (
              <DraggableStaffItem
                key={staff.id}
                staff={staff}
                onRemove={() => handleStaffRemove(staff.id)}
                currentDate={effectiveDate}
                teamName={resource.title}
              />
            ))}
          </div>
        ) : null}
      </div>
      
      {/* Enhanced drop feedback overlay with smooth animations */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`text-xs font-medium px-2 py-1 rounded transition-all duration-150 ${
            canDrop 
              ? 'bg-green-200 text-green-800 shadow-lg' 
              : 'bg-red-200 text-red-800 shadow-lg'
          }`}>
            {canDrop ? `Drop for ${format(effectiveDate, 'MMM d')}` : 'Already assigned'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceHeaderDropZone;
