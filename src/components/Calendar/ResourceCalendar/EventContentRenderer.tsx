
import React from 'react';
import { renderEventContent, setupEventActions, addEventAttributes } from '../CalendarEventRenderer';

// Export the EventContentRenderer
const EventContentRenderer = (
  info: any, 
  handleDuplicateButtonClick: (eventId: string) => void, 
  handleDeleteButtonClick: (eventId: string, bookingId: string, eventType: string) => void
) => {
  return renderEventContent(info);
};

// Add static methods for event setup
EventContentRenderer.setupEvent = (
  info: any, 
  handleDuplicateButtonClick: (eventId: string) => void, 
  handleDeleteButtonClick: (eventId: string, bookingId: string, eventType: string) => void
) => {
  // Add data attributes and setup event-specific elements
  addEventAttributes(info);
  setupEventActions(info, handleDuplicateButtonClick, handleDeleteButtonClick);
  
  // Make sure all events are draggable, including team-6 events
  // Remove any cursor restrictions
  info.el.style.cursor = 'move';
  info.el.style.pointerEvents = 'auto';
};

export { EventContentRenderer };
