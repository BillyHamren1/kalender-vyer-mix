
import React from 'react';

// Targeted styles for event visibility and proper calendar functionality
export const ResourceCalendarStyles: React.FC = () => (
  <style>
    {`
      /* Event content styling for better text wrapping */
      .event-delivery-address {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
        max-height: none !important;
        white-space: normal !important;
      }
      
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
      }
      
      .fc-event-time {
        white-space: nowrap;
      }
      
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
      }
      
      .fc-timegrid-event .fc-event-main {
        padding: 2px 4px !important;
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
      
      /* Targeted background fixes - only for specific problem areas */
      .fc-timegrid-slot-lane {
        background: transparent !important;
      }
      
      .fc-timegrid-col-bg {
        background: white !important;
      }
      
      /* Ensure events are visible with proper z-index */
      .fc-timegrid-event-harness,
      .fc-event,
      .fc-event-main,
      .fc-timegrid-event {
        z-index: 10 !important;
        position: relative !important;
        visibility: visible !important;
        opacity: 1 !important;
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
    `}
  </style>
);
