
import React from 'react';

// Custom styles to ensure addresses wrap properly and FORCE ALL TEAM COLUMNS TO BE VISIBLE
export const ResourceCalendarStyles: React.FC = () => (
  <style>
    {`
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
      
      /* CRITICAL: Force ALL resource columns to be properly sized and VISIBLE */
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
        display: table-cell !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* CRITICAL: Ensure header area matches content area exactly */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 120px !important;
        width: 120px !important;
        max-width: none !important;
        display: table-cell !important;
        visibility: visible !important;
      }
      
      /* CRITICAL: Force resource area to be visible with proper display */
      .fc-resource-area {
        display: table !important;
        visibility: visible !important;
        opacity: 1 !important;
        width: auto !important;
        min-width: fit-content !important;
      }
      
      /* CRITICAL: Ensure time grid columns are properly sized and visible */
      .fc-timegrid-col {
        min-width: 120px !important;
        width: auto !important;
        display: table-cell !important;
        visibility: visible !important;
      }
      
      /* CRITICAL: Make sure the time grid expands to show all columns */
      .fc-timegrid {
        min-width: fit-content !important;
        width: 100% !important;
        table-layout: auto !important;
        display: table !important;
      }
      
      /* CRITICAL: Ensure all teams are visible by making the calendar wide enough */
      .fc-datagrid {
        min-width: fit-content !important;
        width: 100% !important;
        display: table !important;
      }
      
      /* CRITICAL: Make resource headers visible and properly sized */
      .fc-col-header-cell {
        min-width: 120px !important;
        width: 120px !important;
        max-width: none !important;
        display: table-cell !important;
        visibility: visible !important;
      }
      
      /* CRITICAL: Force resource timeline to show all columns */
      .fc-resource-timeline {
        display: table !important;
        width: 100% !important;
        table-layout: auto !important;
      }
      
      /* CRITICAL: Ensure the entire scrollgrid uses table layout for proper column display */
      .fc-scrollgrid-liquid {
        width: 100% !important;
        table-layout: auto !important;
        display: table !important;
      }
      
      /* CRITICAL: Force table sections to display properly */
      .fc-scrollgrid-section {
        display: table-row-group !important;
      }
      
      .fc-scrollgrid-section > table {
        width: 100% !important;
        table-layout: auto !important;
        display: table !important;
      }
      
      /* CRITICAL: Ensure header and body tables align */
      .fc-col-header,
      .fc-datagrid-body {
        width: 100% !important;
        table-layout: auto !important;
        display: table !important;
      }

      /* CRITICAL: Fix grey overlay issue - ensure calendar grid has proper backgrounds */
      .fc-timegrid-slots,
      .fc-timegrid-slot,
      .fc-timegrid-slot-lane {
        background: white !important;
      }

      /* CRITICAL: Ensure events are visible and not hidden behind grey overlay */
      .fc-timegrid-event-harness,
      .fc-event,
      .fc-event-main {
        z-index: 3 !important;
        position: relative !important;
      }

      /* CRITICAL: Fix calendar backgrounds to prevent grey overlay */
      .fc-scrollgrid,
      .fc-scrollgrid-sync-table,
      .fc-view-harness {
        background: white !important;
      }
    `}
  </style>
);
