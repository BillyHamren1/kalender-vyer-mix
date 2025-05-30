
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Plus } from 'lucide-react';
import DraggableStaffItem from './DraggableStaffItem';
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
  minHeight = 120 // Fixed height for consistency
}) => {
  const effectiveDate = targetDate || currentDate;
  
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff, target date: ${format(effectiveDate, 'yyyy-MM-dd')}, fixed height: ${minHeight}px`);

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
    let baseClass = `resource-header-drop-zone p-1 h-full w-full flex flex-col justify-between relative transition-all duration-150`;
    
    if (isOver && canDrop) {
      return `${baseClass} bg-green-100 border-2 border-green-400 shadow-lg transform scale-105`;
    } else if (isOver && !canDrop) {
      return `${baseClass} bg-red-100 border-2 border-red-400 transform scale-105`;
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
        height: `${minHeight}px`, // Fixed height
        minHeight: `${minHeight}px`,
        maxHeight: `${minHeight}px`,
        overflow: 'hidden',
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Team Header Section - ultra compact */}
      <div className="flex flex-col border-b border-gray-200 pb-0.5 mb-0.5 relative">
        <div 
          className="w-full text-[10px] font-medium text-center cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 p-0.5 rounded border border-transparent hover:border-blue-200 relative" 
          title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
          onClick={handleSelectStaff}
        >
          <span className="block pr-2">{resource.title}</span>
          <Plus className="h-2.5 w-2.5 absolute top-0 right-0 text-[#7BAEBF]" />
        </div>
      </div>
      
      {/* Staff Section - ultra tight with fixed height and scrolling */}
      <div 
        className="staff-section flex-1 min-h-0 overflow-y-auto"
        style={{ 
          maxHeight: `${minHeight - 25}px`, // Leave room for header
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
          WebkitScrollbarWidth: 'none' // Hide scrollbar but keep functionality
        }}
      >
        {assignedStaff.length > 0 ? (
          <div className="space-y-0">
            {assignedStaff.map((staff, index) => (
              <div key={staff.id} style={{ marginBottom: index < assignedStaff.length - 1 ? '1px' : '0' }}>
                <DraggableStaffItem
                  staff={staff}
                  onRemove={() => handleStaffRemove(staff.id)}
                  currentDate={effectiveDate}
                  teamName={resource.title}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      
      {/* Enhanced drop feedback overlay */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`text-[10px] font-medium px-1 py-0.5 rounded transition-all duration-150 ${
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
