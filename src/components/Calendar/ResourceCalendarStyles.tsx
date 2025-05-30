
import React from 'react';

// Enhanced styles for proper event duration display and resizing functionality
export const ResourceCalendarStyles: React.FC = () => (
  <style>
    {`
      /* CRITICAL: Increased time slot height for better event visibility */
      .fc-timegrid-slot {
        min-height: 60px !important;
        height: 60px !important;
      }
      
      .fc-timegrid-slot-lane {
        min-height: 60px !important;
        height: 60px !important;
      }
      
      /* Event sizing improvements - ensure events scale with duration */
      .fc-timegrid-event {
        min-height: 40px !important;
        margin: 1px 2px !important;
        border-radius: 4px !important;
        cursor: move !important;
        pointer-events: auto !important;
        /* Ensure events properly fill their time slots */
        box-sizing: border-box !important;
      }
      
      .fc-event {
        min-height: 40px !important;
        margin: 1px 0 !important;
        padding: 4px 6px !important;
        border-radius: 4px !important;
        cursor: move !important;
        pointer-events: auto !important;
        position: relative !important;
        /* Better event scaling for long durations */
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
      }
      
      .fc-event-main {
        min-height: 36px !important;
        padding: 2px 4px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        pointer-events: none !important;
        flex-grow: 1 !important;
      }
      
      /* CRITICAL: Visible and functional resize handles */
      .fc-event-resizer {
        display: block !important;
        position: absolute !important;
        z-index: 999 !important;
        overflow: visible !important;
        pointer-events: auto !important;
        cursor: ns-resize !important;
        background: rgba(0,0,0,0.2) !important;
        border-radius: 2px !important;
        transition: background-color 0.2s ease !important;
      }
      
      .fc-event-resizer-start {
        cursor: ns-resize !important;
        top: -4px !important;
        left: 2px !important;
        right: 2px !important;
        height: 8px !important;
        background: rgba(0,0,0,0.3) !important;
        border-radius: 3px 3px 0 0 !important;
      }
      
      .fc-event-resizer-end {
        cursor: ns-resize !important;
        bottom: -4px !important;
        left: 2px !important;
        right: 2px !important;
        height: 8px !important;
        background: rgba(0,0,0,0.3) !important;
        border-radius: 0 0 3px 3px !important;
      }
      
      /* Enhanced resize handle visibility on hover */
      .fc-event:hover .fc-event-resizer {
        background: rgba(0,0,0,0.5) !important;
      }
      
      .fc-event:hover .fc-event-resizer-start,
      .fc-event:hover .fc-event-resizer-end {
        background: rgba(0,0,0,0.6) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
      }
      
      /* Ensure event content allows dragging but not text selection */
      .fc-event-title,
      .fc-event-time,
      .event-content-wrapper,
      .event-delivery-address,
      .event-booking-id,
      .event-client-name,
      .event-city {
        pointer-events: none !important;
        user-select: none !important;
      }
      
      /* Enhanced event content styling for longer events */
      .event-delivery-address {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
        max-height: none !important;
        white-space: normal !important;
        font-size: 11px;
        line-height: 1.2;
        margin-top: 2px;
        flex-grow: 1;
      }
      
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        margin-bottom: 2px;
      }
      
      .fc-event-time {
        white-space: nowrap;
        font-size: 11px;
        font-weight: 500;
        margin-bottom: 2px;
        color: rgba(0,0,0,0.8) !important;
      }
      
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
        flex-grow: 1;
      }
      
      /* Resource column sizing - optimal for team display */
      .fc-resource-area,
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion {
        min-width: 140px !important;
        width: 140px !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }
      
      /* Header and body alignment */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 140px !important;
        width: 140px !important;
        max-width: none !important;
      }
      
      /* Time grid columns sizing */
      .fc-timegrid-col {
        min-width: 140px !important;
        width: auto !important;
      }
      
      .fc-col-header-cell {
        min-width: 140px !important;
        width: 140px !important;
        max-width: none !important;
      }
      
      /* Time axis styling - increased height to match slots */
      .fc-timegrid-axis {
        width: 70px !important;
        min-width: 70px !important;
      }
      
      .fc-timegrid-slot-label {
        height: 60px !important;
        line-height: 60px !important;
        font-size: 12px;
        font-weight: 500;
      }
      
      /* Ensure events are visible with proper z-index and functionality */
      .fc-timegrid-event-harness,
      .fc-event,
      .fc-event-main,
      .fc-timegrid-event {
        z-index: 10 !important;
        position: relative !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      
      /* Calendar container - clean white background */
      .calendar-container {
        background: white !important;
        background-color: white !important;
        border-radius: 8px;
        overflow: visible !important;
      }
      
      /* Proper scrolling behavior */
      .fc-scroller {
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      
      .fc-scroller-liquid {
        overflow-y: auto !important;
      }
      
      /* Weekly view specific adjustments */
      .weekly-view-calendar .fc-timegrid-body {
        min-height: auto !important;
      }
      
      .weekly-view-calendar .fc-timegrid-slots {
        min-height: auto !important;
      }
      
      /* Prevent event overlap and ensure proper stacking */
      .fc-timegrid-event-harness-inset {
        left: 3px !important;
        right: 3px !important;
        top: 1px !important;
        bottom: 1px !important;
      }
      
      /* Better event spacing and visibility */
      .fc-event-title-container {
        padding: 2px 3px;
        overflow: visible;
        flex-grow: 1;
      }
      
      /* Enhanced drag and drop functionality */
      .fc-timegrid-event-harness {
        cursor: move !important;
        pointer-events: auto !important;
      }
      
      /* Ensure action buttons don't interfere with resizing */
      .event-actions {
        pointer-events: auto !important;
        z-index: 20 !important;
        position: absolute !important;
        top: 2px !important;
        right: 2px !important;
        background: rgba(255, 255, 255, 0.9) !important;
        border-radius: 3px !important;
        padding: 2px !important;
        display: none !important;
      }
      
      .fc-event:hover .event-actions {
        display: flex !important;
      }
      
      .duplicate-event-btn,
      .delete-event-btn {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      
      /* Special handling for different event durations */
      .fc-event[data-duration="long"] {
        min-height: 120px !important;
      }
      
      .fc-event[data-duration="medium"] {
        min-height: 80px !important;
      }
      
      .fc-event[data-duration="short"] {
        min-height: 40px !important;
      }
      
      /* Enhanced mobile support */
      @media (max-width: 768px) {
        .fc-timegrid-slot {
          height: 50px !important;
          min-height: 50px !important;
        }
        
        .fc-timegrid-slot-label {
          height: 50px !important;
          line-height: 50px !important;
          font-size: 11px;
        }
        
        .fc-event {
          min-height: 35px !important;
          padding: 3px 4px !important;
        }
        
        .fc-event-title {
          font-size: 12px;
        }
        
        .fc-event-time {
          font-size: 10px;
        }
        
        .event-actions {
          opacity: 0.8 !important;
          display: flex !important;
        }
      }
      
      /* Debug information display */
      .event-debug-info {
        position: absolute;
        bottom: 2px;
        left: 2px;
        font-size: 9px;
        color: rgba(0,0,0,0.6);
        background: rgba(255,255,255,0.8);
        padding: 1px 2px;
        border-radius: 2px;
        pointer-events: none;
      }
    `}
  </style>
);
