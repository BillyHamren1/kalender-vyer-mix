
import React from 'react';
import { CalendarEvent } from './ResourceData';
import { Copy } from 'lucide-react';

interface RenderEventContentProps {
  eventInfo: any;
  handleDuplicateButtonClick: (eventId: string) => void;
}

export const renderEventContent = (eventInfo: any) => {
  // Get the event details
  const eventTitle = eventInfo.event.title;
  const eventTime = eventInfo.timeText;
  const bookingId = eventInfo.event.extendedProps?.bookingId || '';
  
  // Get delivery address from event extendedProps or use default message
  const deliveryAddress = eventInfo.event.extendedProps?.deliveryAddress || 'No address provided';
  
  // Extract the client name (remove the booking ID if it's in the title)
  const clientName = eventTitle.includes(':') 
    ? eventTitle.split(':')[1].trim() 
    : eventTitle;
  
  // Display the four-row format for all events
  return (
    <div className="event-content-wrapper">
      <div className="event-time font-semibold">{eventTime}</div>
      <div className="event-client-name text-sm truncate">{clientName}</div>
      <div className="event-booking-id text-xs opacity-80 truncate">ID: {bookingId}</div>
      <div className="event-delivery-address text-xs truncate">{deliveryAddress}</div>
    </div>
  );
};

export const setupEventActions = (
  info: any, 
  handleDuplicateButtonClick: (eventId: string) => void
) => {
  // Identify team-6 events for special handling
  const isTeam6Event = info.event.getResources()[0]?.id === 'team-6';
  if (isTeam6Event) {
    info.el.setAttribute('data-team6-event', 'true');
    return;
  }
  
  // Add duplicate button to non-team-6 events
  const eventEl = info.el;
  const eventId = info.event.id;
  
  // Create a container for the duplicate button
  const actionContainer = document.createElement('div');
  actionContainer.className = 'event-actions';
  actionContainer.style.position = 'absolute';
  actionContainer.style.top = '2px';
  actionContainer.style.right = '2px';
  actionContainer.style.display = 'none'; // Hidden by default, shown on hover
  actionContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  actionContainer.style.borderRadius = '4px';
  actionContainer.style.padding = '2px';
  actionContainer.style.zIndex = '10';
  
  // Create the duplicate button with icon
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
  
  // Add duplicate button to the container
  actionContainer.appendChild(duplicateButton);
  
  // Add container to the event element
  eventEl.appendChild(actionContainer);
  
  // Add event listeners
  duplicateButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent event click handler from being triggered
    handleDuplicateButtonClick(eventId);
  });
  
  // Show actions on hover (for desktop)
  eventEl.addEventListener('mouseenter', () => {
    actionContainer.style.display = 'block';
  });
  
  eventEl.addEventListener('mouseleave', () => {
    actionContainer.style.display = 'none';
  });
  
  // For mobile, show on touch start and hide after a delay
  eventEl.addEventListener('touchstart', () => {
    actionContainer.style.display = 'block';
    // Hide after 5 seconds to prevent it from staying visible forever
    setTimeout(() => {
      actionContainer.style.display = 'none';
    }, 5000);
  });
};

// Add data event type attribute
export const addEventAttributes = (info: any) => {
  if (info.event.extendedProps.eventType) {
    info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
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
      cellFrameElement.style.minHeight = '100px'; // Ensure enough space for staff badges
    }
  }
};
