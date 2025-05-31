
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
  minHeight = 80
}) => {
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
    let baseClass = `resource-header-drop-zone h-full w-full flex flex-col relative transition-all duration-150`;
    
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
        height: '80px',
        overflow: 'visible',
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Fixed Team Header Section */}
      <div className="flex justify-between items-center px-1 py-1 border-b border-gray-200 bg-gray-50">
        <div 
          className="text-xs font-medium cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 px-1 py-0.5 rounded text-center flex-1 relative" 
          title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
          onClick={handleSelectStaff}
        >
          <span className="block text-[10px] leading-tight">{resource.title}</span>
          <Plus className="h-2 w-2 absolute top-0 right-0 text-[#7BAEBF]" />
        </div>
      </div>
      
      {/* Fixed Height Horizontal Staff Section */}
      <div className="horizontal-staff-container flex-1 p-1">
        {assignedStaff.length > 0 ? (
          <div 
            className="flex gap-0.5 overflow-x-auto h-full scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#d1d5db transparent'
            }}
          >
            {assignedStaff.map((staff) => (
              <div
                key={staff.id}
                className="flex-shrink-0 w-[16px] h-[18px] bg-white border border-gray-200 rounded text-[8px] font-medium cursor-move hover:shadow-sm transition-all duration-150 flex items-center justify-center relative group"
                title={staff.name}
                onDoubleClick={() => handleStaffRemove(staff.id)}
              >
                <span className="text-[8px] font-bold leading-none">
                  {staff.name.split(' ')[0].charAt(0).toUpperCase()}
                </span>
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full text-white text-[6px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                     onClick={(e) => {
                       e.stopPropagation();
                       handleStaffRemove(staff.id);
                     }}>
                  ×
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[8px] text-gray-400">
            <span>Drop staff</span>
          </div>
        )}
      </div>
      
      {/* Enhanced drop feedback overlay */}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className={`text-[8px] font-medium px-1 py-0.5 rounded transition-all duration-150 ${
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
