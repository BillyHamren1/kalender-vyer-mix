
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
  minHeight = 120
}) => {
  const effectiveDate = targetDate || currentDate;
  
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff, target date: ${format(effectiveDate, 'yyyy-MM-dd')}`);

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
    let baseClass = `transition-all duration-150`;
    
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
        width: '100%',
        minHeight: `${minHeight}px`,
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {/* Team Header Section */}
      <div 
        className="flex-shrink-0 bg-gray-50 border-b border-gray-200"
        style={{
          height: '24px',
          padding: '2px 4px'
        }}
      >
        <div 
          className="w-full text-[10px] font-medium text-center cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 rounded border border-transparent hover:border-blue-200 relative h-full flex items-center justify-center" 
          title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
          onClick={handleSelectStaff}
        >
          <span className="block pr-3 truncate">{resource.title}</span>
          <Plus className="h-2 w-2 absolute top-0.5 right-0.5 text-[#7BAEBF]" />
        </div>
      </div>
      
      {/* Staff Section */}
      <div 
        className="flex-1 overflow-y-auto"
        style={{ 
          padding: '2px',
          maxHeight: `${minHeight - 28}px`
        }}
      >
        {assignedStaff.length > 0 ? (
          <div className="space-y-1">
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
      
      {/* Enhanced drop feedback overlay */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className={`text-[9px] font-medium px-1 py-0.5 rounded transition-all duration-150 ${
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
