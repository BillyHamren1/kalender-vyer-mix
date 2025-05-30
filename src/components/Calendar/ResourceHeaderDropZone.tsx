
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
  minHeight = 120 // LOCKED height for ALL cells to maintain grid alignment
}) => {
  const effectiveDate = targetDate || currentDate;
  
  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with ${assignedStaff.length} staff, target date: ${format(effectiveDate, 'yyyy-MM-dd')}, LOCKED height: ${minHeight}px`);

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
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '120px', // LOCKED height - CSS will enforce this
        minHeight: '120px',
        maxHeight: '120px',
        overflow: 'hidden', // CRITICAL: prevent content overflow that affects layout
        zIndex: 15
      }}
    >
      {/* Team Header Section - ABSOLUTELY positioned at top */}
      <div 
        className="absolute top-0 left-0 right-0 z-20 bg-gray-50"
        style={{
          height: '20px', // Fixed header height
          borderBottom: '1px solid #e5e7eb',
          padding: '1px 2px'
        }}
      >
        <div 
          className="w-full text-[9px] font-medium text-center cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 rounded border border-transparent hover:border-blue-200 relative h-full flex items-center justify-center" 
          title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
          onClick={handleSelectStaff}
        >
          <span className="block pr-3 truncate">{resource.title}</span>
          <Plus className="h-2 w-2 absolute top-0.5 right-0.5 text-[#7BAEBF]" />
        </div>
      </div>
      
      {/* Staff Section - ABSOLUTELY positioned below header with FIXED scrollable area */}
      <div 
        className="absolute z-15 bg-gray-50"
        style={{ 
          top: '21px', // Just below the header
          left: '0',
          right: '0',
          height: '99px', // FIXED height for staff area (120px - 21px header)
          maxHeight: '99px',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
          padding: '1px'
        }}
      >
        <style>
          {`
            .staff-container::-webkit-scrollbar {
              display: none;
            }
          `}
        </style>
        {assignedStaff.length > 0 ? (
          <div className="space-y-0.5 staff-container">
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
      
      {/* Enhanced drop feedback overlay - ABSOLUTELY positioned */}
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
