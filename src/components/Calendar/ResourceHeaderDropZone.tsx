
import React, { useState, useRef, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Plus, ChevronDown } from 'lucide-react';
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
  minHeight = 100
}) => {
  const effectiveDate = targetDate || currentDate;
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
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

  // Check scroll indicator
  const checkScrollable = () => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight, scrollTop } = scrollContainerRef.current;
      const hasScrollableContent = scrollHeight > clientHeight + 2;
      const hasMoreBelow = scrollTop + clientHeight < scrollHeight - 2;
      
      setShowScrollIndicator(hasScrollableContent && hasMoreBelow);
    }
  };

  const handleScroll = () => {
    checkScrollable();
  };

  // Check scroll indicator on mount and when staff changes
  useEffect(() => {
    checkScrollable();
    const timer = setTimeout(checkScrollable, 100);
    return () => clearTimeout(timer);
  }, [assignedStaff.length]);

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
    <div className="relative" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
      <div
        ref={drop}
        className={getDropZoneClass()}
        style={{ 
          height: '100px',
          minHeight: '100px',
          overflow: 'visible',
          position: 'relative',
          zIndex: 10
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Fixed Team Header Section */}
        <div className="flex justify-between items-center px-1 py-1 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div 
            className="text-sm font-medium cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 px-1 py-0.5 rounded text-center flex-1 relative" 
            title={`Click to assign staff to ${resource.title} on ${format(effectiveDate, 'MMM d')}`}
            onClick={handleSelectStaff}
          >
            <span className="block text-sm leading-tight">{resource.title}</span>
            <Plus className="h-2 w-2 absolute top-0 right-0 text-[#7BAEBF]" />
          </div>
        </div>
        
        {/* Scrollable Staff Section */}
        <div className="flex-1 overflow-hidden relative">
          {assignedStaff.length > 0 ? (
            <div 
              ref={scrollContainerRef}
              className={`h-full overflow-y-auto p-1 enhanced-scrollbar ${isHovering ? 'scrollbar-visible' : ''}`}
              style={{
                maxHeight: '72px'
              }}
              onScroll={handleScroll}
            >
              <div className="space-y-1">
                {assignedStaff.map((staff) => (
                  <div key={staff.id}>
                    <UnifiedDraggableStaffItem
                      staff={{
                        id: staff.id,
                        name: staff.name,
                        assignedTeam: resource.id
                      }}
                      onRemove={() => handleStaffRemove(staff.id)}
                      currentDate={effectiveDate}
                      teamName={resource.title}
                      variant="compact"
                      showRemoveDialog={false}
                    />
                  </div>
                ))}
              </div>
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
      
      {/* Scroll Arrow Indicator - positioned below the main container */}
      {showScrollIndicator && (
        <div className="absolute left-1/2 transform -translate-x-1/2 mt-1 pointer-events-none z-30">
          <div className="bg-white rounded-full p-0.5 shadow-md">
            <ChevronDown className="h-3 w-3 text-[#7BAEBF]" strokeWidth={3} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceHeaderDropZone;
