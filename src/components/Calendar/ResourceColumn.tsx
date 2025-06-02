
import React from 'react';
import { Resource } from './ResourceData';
import { useDrop } from 'react-dnd';

interface ResourceColumnProps {
  resource: Resource;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
}

const ResourceColumn: React.FC<ResourceColumnProps> = ({
  resource,
  onStaffDrop
}) => {
  const [{ isOver }, drop] = useDrop({
    accept: ['staff', 'event'],
    drop: (item: any) => {
      console.log('ResourceColumn: Item dropped on resource', resource.id, item);
      if (item.type === 'staff' && onStaffDrop) {
        onStaffDrop(item.id, resource.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div
      ref={drop}
      className={`resource-column ${isOver ? 'drop-over' : ''}`}
      style={{
        backgroundColor: isOver ? '#e3f2fd40' : 'transparent',
        borderLeft: `3px solid ${resource.eventColor}`,
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
      }}
    >
      <div className="resource-title">
        {resource.title}
      </div>
    </div>
  );
};

export default ResourceColumn;
