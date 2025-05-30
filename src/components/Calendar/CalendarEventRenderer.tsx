
import React from 'react';
import { CalendarEvent } from './ResourceData';
import { Copy, Trash2 } from 'lucide-react';
import EventHoverCard from './EventHoverCard';
import { format } from 'date-fns';

export const renderEventContent = (eventInfo: any) => {
  // Get the event details
  const eventTitle = eventInfo.event.title;
  
  // FIXED: Use the corrected duration from extendedProps instead of recalculating
  const duration = eventInfo.event.extendedProps?.durationHours || 0;
  const startTimeDisplay = eventInfo.event.extendedProps?.localStartTime || 
                          format(new Date(eventInfo.event.start), 'HH:mm');
  const endTimeDisplay = eventInfo.event.extendedProps?.localEndTime || 
                        format(new Date(eventInfo.event.end), 'HH:mm');
  const timeRangeDisplay = `${startTimeDisplay}-${endTimeDisplay}`;
  
  console.log(`Event ${eventInfo.event.id} FIXED time rendering:`, {
    duration: duration,
    startDisplay: startTimeDisplay,
    endDisplay: endTimeDisplay,
    timeRange: timeRangeDisplay,
    source: 'extendedProps (FIXED)'
  });
  
  // Use bookingNumber if available, otherwise fall back to bookingId, or extract from title
  let displayId = eventInfo.event.extendedProps?.bookingNumber || 
                  eventInfo.event.extendedProps?.bookingId || 
                  '';
  
  // If no explicit booking number, try to extract from title
  if (!displayId && eventTitle.includes(':')) {
    displayId = eventTitle.split(':')[0].trim();
  }
  
  // Get delivery address from event extendedProps or use default message
  const deliveryAddress = eventInfo.event.extendedProps?.deliveryAddress || 'No address provided';
  
  // Extract the client name - handle both "BookingNum: Client" and just "Client" formats
  let clientName = eventTitle;
  if (eventTitle.includes(':')) {
    clientName = eventTitle.split(':')[1].trim();
  }

  // Get city from the proper field - use deliveryCity from bookings table
  // Fall back to parsing from address only if no proper city is available
  const city = eventInfo.event.extendedProps?.deliveryCity || 
               (deliveryAddress.split(',').length > 1 ? deliveryAddress.split(',')[1].trim() : '');

  // Create event object for hover card
  const eventForHover: CalendarEvent = {
    id: eventInfo.event.id,
    title: eventTitle,
    start: eventInfo.event.start,
    end: eventInfo.event.end,
    resourceId: eventInfo.event.getResources()[0]?.id || '',
    extendedProps: eventInfo.event.extendedProps || {}
  };

  // FIXED event content component with corrected duration display
  const EventContent = () => {
    if (eventInfo.view.type === 'resourceTimelineWeek') {
      // More compact display for timeline view
      return (
        <div className="event-content-wrapper w-full h-full px-1" style={{ color: '#000000' }}>
          <div className="event-time text-xs font-medium mb-1" style={{ color: '#000000' }}>
            {timeRangeDisplay} ({duration}h)
          </div>
          {displayId && (
            <div className="event-booking-id text-xs opacity-80 truncate leading-tight" style={{ color: '#000000', fontSize: '10px' }}>#{displayId}</div>
          )}
          <div className="event-client-name text-xs break-words whitespace-normal" 
               style={{ lineHeight: '1.1', maxHeight: '2.2em', overflow: 'hidden', color: '#000000', fontSize: '11px' }}>
            {clientName}
          </div>
          {city && (
            <div className="event-city text-xs opacity-80 truncate leading-tight" style={{ color: '#000000', fontSize: '10px' }}>{city}</div>
          )}
        </div>
      );
    }
    
    // Enhanced display for other views with FIXED duration information
    return (
      <div className="event-content-wrapper w-full h-full px-1" style={{ color: '#000000' }}>
        <div className="event-time text-xs font-medium mb-1" style={{ color: '#000000' }}>
          {timeRangeDisplay} ({duration}h)
        </div>
        {displayId && (
          <div className="event-booking-id text-xs opacity-80 truncate leading-tight" style={{ color: '#000000', fontSize: '10px' }}>#{displayId}</div>
        )}
        <div className="event-client-name text-xs break-words whitespace-normal" 
             style={{ lineHeight: '1.1', color: '#000000', fontSize: '11px', flexGrow: 1 }}>
          {clientName}
        </div>
        {city && (
          <div className="event-city text-xs opacity-80 truncate leading-tight" style={{ color: '#000000', fontSize: '10px' }}>{city}</div>
        )}
        {/* Debug info shows FIXED duration */}
        {process.env.NODE_ENV === 'development' && (
          <div className="event-debug-info text-xs" style={{ color: '#000000', background: 'rgba(255,255,255,0.8)' }}>
            FIXED: {duration}h | {startTimeDisplay}-{endTimeDisplay}
          </div>
        )}
      </div>
    );
  };

  // Wrap the event content with hover card
  return (
    <EventHoverCard event={eventForHover}>
      <div className="w-full h-full cursor-pointer">
        <EventContent />
      </div>
    </EventHoverCard>
  );
};

export const setupEventActions = (
  info: any, 
  handleDuplicateButtonClick: (eventId: string) => void,
  handleDeleteButtonClick?: (eventId: string) => void
) => {
  // Identify team-6 events for special handling
  const resourceId = info.event.getResources()[0]?.id || '';
  const isTeam6Event = resourceId.includes('team-6') || resourceId.includes('_team-6');
  
  if (isTeam6Event) {
    info.el.setAttribute('data-team6-event', 'true');
  }
  
  // Add action buttons to all events (including team-6)
  const eventEl = info.el;
  const eventId = info.event.id;
  
  // Create a container for action buttons
  const actionContainer = document.createElement('div');
  actionContainer.className = 'event-actions';
  actionContainer.style.position = 'absolute';
  actionContainer.style.top = '2px';
  actionContainer.style.right = '2px';
  actionContainer.style.display = 'none'; // Hidden by default, shown on hover
  actionContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  actionContainer.style.borderRadius = '4px';
  actionContainer.style.padding = '2px';
  actionContainer.style.zIndex = '10';
  actionContainer.style.gap = '2px';
  actionContainer.style.flexDirection = 'row';
  actionContainer.style.alignItems = 'center';
  
  // Create the duplicate button with icon (only for non-team-6 events)
  if (!isTeam6Event) {
    const duplicateButton = document.createElement('button');
    duplicateButton.className = 'duplicate-event-btn';
    duplicateButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" ry="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
    duplicateButton.title = 'Duplicate this event';
    duplicateButton.style.cursor = 'pointer';
    duplicateButton.style.border = 'none';
    duplicateButton.style.background = 'transparent';
    duplicateButton.style.display = 'flex';
    duplicateButton.style.alignItems = 'center';
    duplicateButton.style.justifyContent = 'center';
    duplicateButton.style.padding = '2px';
    duplicateButton.style.borderRadius = '2px';
    
    duplicateButton.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDuplicateButtonClick(eventId);
    });
    
    actionContainer.appendChild(duplicateButton);
  }
  
  // Create the delete button with icon (for all events)
  if (handleDeleteButtonClick) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-event-btn';
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 3 0"/><path d="m6 6 0 14c0 1 0 2 2 2l8 0c2 0 2-1 2-2l0-14"/><path d="m8 6 0-2c0-1 0-2 2-2l4 0c2 0 2 1 2 2l0 2"/><path d="m10 12 0 6"/><path d="m14 12 0 6"/></svg>';
    deleteButton.title = 'Delete this event';
    deleteButton.style.cursor = 'pointer';
    deleteButton.style.border = 'none';
    deleteButton.style.background = 'transparent';
    deleteButton.style.display = 'flex';
    deleteButton.style.alignItems = 'center';
    deleteButton.style.justifyContent = 'center';
    deleteButton.style.padding = '2px';
    deleteButton.style.borderRadius = '2px';
    deleteButton.style.color = '#dc2626'; // Red color for delete
    
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteButtonClick(eventId);
    });
    
    actionContainer.appendChild(deleteButton);
  }
  
  // Only add container if it has buttons
  if (actionContainer.children.length > 0) {
    actionContainer.style.display = 'flex';
    
    // Add container to the event element
    eventEl.appendChild(actionContainer);
    
    // Show actions on hover (for desktop)
    eventEl.addEventListener('mouseenter', () => {
      actionContainer.style.display = 'flex';
    });
    
    eventEl.addEventListener('mouseleave', () => {
      actionContainer.style.display = 'none';
    });
    
    // For mobile, show on touch start and hide after a delay
    eventEl.addEventListener('touchstart', () => {
      actionContainer.style.display = 'flex';
      // Hide after 5 seconds to prevent it from staying visible forever
      setTimeout(() => {
        actionContainer.style.display = 'none';
      }, 5000);
    });
  }
};

// Enhanced event attributes with duration classes
export const addEventAttributes = (info: any) => {
  if (info.event.extendedProps.eventType) {
    info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
  }
  
  // Use the FIXED duration from extendedProps instead of recalculating
  const duration = info.event.extendedProps?.durationHours || 0;
  
  // Add duration classes for better styling - FIXED calculation
  if (duration >= 6) {
    info.el.setAttribute('data-duration', 'long');
    info.el.classList.add('event-long-duration');
  } else if (duration >= 3) {
    info.el.setAttribute('data-duration', 'medium');
    info.el.classList.add('event-medium-duration');
  } else {
    info.el.setAttribute('data-duration', 'short');
    info.el.classList.add('event-short-duration');
  }
  
  console.log(`Event ${info.event.id} attributes: FIXED duration=${duration}h, class=${duration >= 6 ? 'long' : duration >= 3 ? 'medium' : 'short'}`);
  
  // Add special class for timeline events to ensure they have proper height
  if (info.view.type === 'resourceTimelineWeek') {
    info.el.classList.add('timeline-event');
  }
};

export const setupResourceHeaderStyles = (info: any) => {
  // Ensure proper rendering of resource headers
  const headerEl = info.el.querySelector('.fc-datagrid-cell-main');
  if (headerEl) {
    // Set the height and make it overflow visible
    const headerHTMLElement = headerEl as HTMLElement;
    headerHTMLElement.style.height = '100%';
    headerHTMLElement.style.width = '100%';
    headerHTMLElement.style.overflow = 'visible';
    headerHTMLElement.style.position = 'relative';
    headerHTMLElement.style.zIndex = '20'; // Increased z-index to ensure visibility
    
    // Also fix the parent elements
    const cellFrame = info.el.querySelector('.fc-datagrid-cell-frame');
    if (cellFrame) {
      const cellFrameElement = cellFrame as HTMLElement;
      cellFrameElement.style.overflow = 'visible';
      cellFrameElement.style.position = 'relative';
      cellFrameElement.style.minHeight = '50px'; // Ensure enough space for staff badges
    }
  }
};
