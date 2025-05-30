
import React from 'react';

// Targeted styles for event visibility and proper calendar functionality
export const ResourceCalendarStyles: React.FC = () => (
  <style>
    {`
      /* Time slot height adjustments for better event spacing */
      .fc-timegrid-slot {
        min-height: 50px !important;
        height: 50px !important;
      }
      
      .fc-timegrid-slot-lane {
        min-height: 50px !important;
        height: 50px !important;
      }
      
      /* Event sizing and spacing improvements - ENABLE DRAGGING AND RESIZING */
      .fc-timegrid-event {
        min-height: 30px !important;
        margin: 1px 2px !important;
        border-radius: 4px !important;
        cursor: move !important;
        pointer-events: auto !important;
      }
      
      .fc-event {
        min-height: 30px !important;
        margin: 1px 0 !important;
        padding: 2px 4px !important;
        border-radius: 4px !important;
        cursor: move !important;
        pointer-events: auto !important;
      }
      
      .fc-event-main {
        min-height: 26px !important;
        padding: 2px 4px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        pointer-events: auto !important;
      }
      
      /* CRITICAL: Enable event resizing handles */
      .fc-event-resizer {
        display: block !important;
        position: absolute !important;
        z-index: 999 !important;
        overflow: hidden !important;
        font-size: 300% !important;
        line-height: 50% !important;
        pointer-events: auto !important;
        cursor: ns-resize !important;
      }
      
      .fc-event-resizer-start {
        cursor: ns-resize !important;
        top: -3px !important;
        left: 0 !important;
        right: 0 !important;
        height: 7px !important;
      }
      
      .fc-event-resizer-end {
        cursor: ns-resize !important;
        bottom: -3px !important;
        left: 0 !important;
        right: 0 !important;
        height: 7px !important;
      }
      
      /* Ensure event content allows dragging but not resizing */
      .fc-event-title,
      .fc-event-time,
      .event-content-wrapper,
      .event-delivery-address,
      .event-booking-id,
      .event-client-name,
      .event-city {
        pointer-events: none !important; /* Let drag events pass through content */
      }
      
      /* Event content styling for better text wrapping */
      .event-delivery-address {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
        max-height: none !important;
        white-space: normal !important;
        font-size: 11px;
        line-height: 1.2;
      }
      
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.3;
      }
      
      .fc-event-time {
        white-space: nowrap;
        font-size: 10px;
        font-weight: 500;
        margin-bottom: 1px;
      }
      
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
      }
      
      /* Resource column sizing - keeping teams visible */
      .fc-resource-area,
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion {
        min-width: 120px !important;
        width: 120px !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }
      
      /* Header and body alignment */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 120px !important;
        width: 120px !important;
        max-width: none !important;
      }
      
      /* Time grid columns sizing */
      .fc-timegrid-col {
        min-width: 120px !important;
        width: auto !important;
      }
      
      .fc-col-header-cell {
        min-width: 120px !important;
        width: 120px !important;
        max-width: none !important;
      }
      
      /* Time axis styling */
      .fc-timegrid-axis {
        width: 60px !important;
        min-width: 60px !important;
      }
      
      .fc-timegrid-slot-label {
        height: 50px !important;
        line-height: 50px !important;
        font-size: 11px;
      }
      
      /* Ensure events are visible with proper z-index and draggable */
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
      
      /* Main calendar container - ensure white background */
      .calendar-container {
        background: white !important;
        background-color: white !important;
      }
      
      /* Ensure proper calendar functionality is preserved */
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
        left: 2px !important;
        right: 2px !important;
      }
      
      /* Improve event readability */
      .fc-event-title-container {
        padding: 1px 2px;
        overflow: visible;
      }
      
      /* Fix drag and drop functionality */
      .fc-timegrid-event-harness {
        cursor: move !important;
        pointer-events: auto !important;
      }
      
      /* Ensure action buttons don't interfere with dragging */
      .event-actions {
        pointer-events: auto !important;
        z-index: 20 !important;
      }
      
      .duplicate-event-btn,
      .delete-event-btn {
        pointer-events: auto !important;
      }
    `}
  </style>
);
