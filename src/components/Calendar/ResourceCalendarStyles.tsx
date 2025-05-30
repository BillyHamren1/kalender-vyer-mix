
import React from 'react';

// Custom styles to ensure addresses wrap properly and CONSISTENT COLUMN WIDTHS
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
      
      /* Enhanced container width for weekly view */
      .weekly-view-calendar .fc-scrollgrid-sync-table {
        width: 100% !important;
        min-width: 100% !important;
      }
      
      /* Force ALL resource columns to be properly sized */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion,
      .fc-timegrid-col,
      .fc-col-header-cell {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
        box-sizing: border-box !important;
      }
      
      /* Ensure header area matches content area exactly */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }
      
      /* Ensure all teams are visible by making the calendar wide enough */
      .weekly-view-calendar .fc-datagrid {
        overflow: visible !important;
      }
      
      .weekly-view-calendar .fc-scroller {
        overflow-x: visible !important;
        overflow-y: auto !important;
      }
      
      /* Make sure the time grid expands to show all columns */
      .weekly-view-calendar .fc-timegrid {
        min-width: fit-content !important;
      }
      
      /* Ensure resource area is wide enough for all teams */
      .weekly-view-calendar .fc-resource-area {
        min-width: calc(80px * var(--team-count, 2)) !important;
        width: auto !important;
      }
    `}
  </style>
);
