import React, { useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { updateCalendarEvent } from '@/services/eventService';
import EventHoverCard from './EventHoverCard';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Clock, Calendar, Eye } from 'lucide-react';
import EditEventTimeDialog from './EditEventTimeDialog';
import MoveEventDateDialog from './MoveEventDateDialog';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
  onEventResize?: () => Promise<void>;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize
}) => {
  const [isResizing, setIsResizing] = useState(false);
  
  // State for real-time visual feedback during resize
  const [tempResizeState, setTempResizeState] = useState<{
    newStart: Date;
    newEnd: Date;
    heightDelta: number;
    topDelta: number;
  } | null>(null);
  
  const eventRef = useRef<HTMLDivElement>(null);

  // Add event navigation hook for context menu
  const { handleEventClick } = useEventNavigation();
  
  // Dialog states
  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const [showDateDialog, setShowDateDialog] = useState(false);

  const eventColor = getEventColor(event.eventType);
  
  // Use temporary times if resizing, otherwise use original times
  const displayStart = tempResizeState ? tempResizeState.newStart : new Date(event.start);
  const displayEnd = tempResizeState ? tempResizeState.newEnd : new Date(event.end);

  // Context menu handlers
  const handleViewDetails = useCallback(() => {
    if (event.bookingId) {
      // Create mock event info for navigation
      const mockEventInfo = {
        event: {
          id: event.id,
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          extendedProps: {
            bookingId: event.bookingId,
            booking_id: event.bookingId,
            ...event.extendedProps
          },
          _def: {
            extendedProps: {
              bookingId: event.bookingId,
              booking_id: event.bookingId
            }
          }
        },
        el: eventRef.current
      };
      handleEventClick(mockEventInfo);
    }
  }, [event, handleEventClick]);

  // Handle resize operations with real-time visual feedback
  const handleResizeStart = (e: React.MouseEvent, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    
    const startY = e.clientY;
    const originalStart = new Date(event.start);
    const originalEnd = new Date(event.end);
    const pixelsPerHour = 25;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = (deltaY / pixelsPerHour) * 60;
      
      let newStart = originalStart;
      let newEnd = originalEnd;
      let heightDelta = 0;
      let topDelta = 0;
      
      if (direction === 'top') {
        newStart = addMinutes(originalStart, deltaMinutes);
        if (newStart >= originalEnd) {
          newStart = addMinutes(originalEnd, -15);
        }
        
        const actualDeltaMinutes = (newStart.getTime() - originalStart.getTime()) / (1000 * 60);
        topDelta = (actualDeltaMinutes / 60) * pixelsPerHour;
        heightDelta = -topDelta;
        
      } else {
        newEnd = addMinutes(originalEnd, deltaMinutes);
        if (newEnd <= originalStart) {
          newEnd = addMinutes(originalStart, 15);
        }
        
        const actualDeltaMinutes = (newEnd.getTime() - originalEnd.getTime()) / (1000 * 60);
        heightDelta = (actualDeltaMinutes / 60) * pixelsPerHour;
        topDelta = 0;
      }
      
      setTempResizeState({
        newStart,
        newEnd,
        heightDelta,
        topDelta
      });
      
      console.log('🔄 RESIZING EVENT (real-time):', { 
        direction,
        deltaY,
        deltaMinutes,
        newStart: format(newStart, 'HH:mm'),
        newEnd: format(newEnd, 'HH:mm'),
        heightDelta: `${heightDelta}px`,
        topDelta: `${topDelta}px`,
        pixelsPerHour
      });
    };
    
    const handleMouseUp = async (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      setIsResizing(false);
      
      if (tempResizeState && onEventResize) {
        try {
          console.log('Finalizing resize operation');
          // Update the database with new times
          await updateCalendarEvent(event.id, {
            start: tempResizeState.newStart.toISOString(),
            end: tempResizeState.newEnd.toISOString()
          });
          // Refresh the calendar
          await onEventResize();
        } catch (error) {
          console.error('Failed to resize event:', error);
        }
      }
      
      setTempResizeState(null);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Calculate dynamic styles with real-time resize feedback
  const getDynamicStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      backgroundColor: eventColor,
      cursor: isResizing ? 'ns-resize' : 'pointer',
      border: isResizing ? '2px solid #3b82f6' : 'none',
      transform: 'none',
      transition: isResizing ? 'none' : 'opacity 0.2s ease, transform 0.2s ease',
      position: 'relative' as const,
      willChange: 'transform, opacity',
      color: '#000000',
      boxShadow: isResizing ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
      zIndex: isResizing ? 500 : 'auto'
    };

    // Apply real-time resize visual feedback
    if (tempResizeState && isResizing) {
      const currentHeight = parseFloat(style?.height as string) || 60;
      const newHeight = Math.max(15, currentHeight + tempResizeState.heightDelta);
      
      return {
        ...baseStyles,
        height: `${newHeight}px`,
        transform: `translateY(${tempResizeState.topDelta}px)`,
        backgroundColor: `${eventColor}dd`,
      };
    }

    return baseStyles;
  };

  // Get booking number and delivery city from event
  const rawBookingId = event.bookingNumber || event.extendedProps?.bookingNumber || event.extendedProps?.booking_id || 'No ID';
  const bookingNumber = rawBookingId.length > 20 ? rawBookingId.slice(-8) : rawBookingId;
  const deliveryCity = event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || '';

  console.log('CustomEvent data:', {
    eventId: event.id,
    title: event.title,
    bookingNumber,
    deliveryCity,
    extendedProps: event.extendedProps
  });

  return (
    <>
      <EventHoverCard event={event}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={eventRef}
              className={`custom-event ${isResizing ? 'resizing' : ''} hover:scale-105`}
              style={getDynamicStyles()}
            >
              {/* Top resize handle */}
              <div
                className="resize-handle resize-handle-top group/handle"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: 0,
                  right: 0,
                  height: '10px',
                  cursor: 'ns-resize',
                  backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.6)' : 'rgba(0, 0, 0, 0.1)',
                  borderTop: '2px solid rgba(59, 130, 246, 0.4)',
                  zIndex: 20,
                  transition: 'all 0.2s ease'
                }}
                onMouseDown={(e) => handleResizeStart(e, 'top')}
                title="Drag to resize start time"
              />
              
              <div className="event-content" style={{ color: '#000000', pointerEvents: isResizing ? 'none' : 'auto' }}>
                <div className="event-title" style={{ color: '#000000' }}>
                  {event.title}
                </div>
                <div 
                  className="event-booking" 
                  style={{ 
                    color: '#000000',
                    fontWeight: isResizing ? 'bold' : 'normal',
                    fontSize: isResizing ? '11px' : '10px'
                  }}
                >
                  #{bookingNumber}
                </div>
                {deliveryCity && (
                  <div 
                    className="event-city" 
                    style={{ 
                      color: '#000000',
                      fontSize: '10px',
                      opacity: 0.8
                    }}
                  >
                    {deliveryCity}
                  </div>
                )}
              </div>
              
              {/* Bottom resize handle */}
              <div
                className="resize-handle resize-handle-bottom group/handle"
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  left: 0,
                  right: 0,
                  height: '10px',
                  cursor: 'ns-resize',
                  backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.6)' : 'rgba(0, 0, 0, 0.1)',
                  borderBottom: '2px solid rgba(59, 130, 246, 0.4)',
                  zIndex: 20,
                  transition: 'all 0.2s ease'
                }}
                onMouseDown={(e) => handleResizeStart(e, 'bottom')}
                title="Drag to resize end time"
              />
            </div>
          </ContextMenuTrigger>
          
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => setShowTimeDialog(true)}>
              <Clock className="mr-2 h-4 w-4" />
              Edit Time
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowDateDialog(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              Move to Date
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleViewDetails}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </EventHoverCard>

      {/* Time Edit Dialog */}
      <EditEventTimeDialog 
        open={showTimeDialog}
        onOpenChange={setShowTimeDialog}
        event={event}
        onUpdate={onEventResize}
      />
      
      {/* Date Move Dialog */}
      <MoveEventDateDialog
        open={showDateDialog}
        onOpenChange={setShowDateDialog}
        event={event}
        onUpdate={onEventResize}
      />
    </>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
