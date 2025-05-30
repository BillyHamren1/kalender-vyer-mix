
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
      
      /* Event sizing and spacing improvements */
      .fc-timegrid-event {
        min-height: 30px !important;
        margin: 1px 2px !important;
        border-radius: 4px !important;
      }
      
      .fc-event {
        min-height: 30px !important;
        margin: 1px 0 !important;
        padding: 2px 4px !important;
        border-radius: 4px !important;
      }
      
      .fc-event-main {
        min-height: 26px !important;
        padding: 2px 4px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
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
    `}
  </style>
);
