
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
      
      /* Force ALL resource columns to be properly sized with larger width */
      .fc-resource-area,
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion {
        min-width: 120px !important;
        width: 120px !important;
        max-width: 120px !important;
        box-sizing: border-box !important;
      }
      
      /* Ensure header area matches content area exactly */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 120px !important;
        width: 120px !important;
        max-width: 120px !important;
      }
      
      /* Force resource area to be visible */
      .fc-resource-area {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* Ensure time grid columns are properly sized */
      .fc-timegrid-col {
        min-width: 120px !important;
        width: auto !important;
      }
      
      /* Make sure the time grid expands to show all columns */
      .weekly-view-calendar .fc-timegrid {
        min-width: fit-content !important;
        width: 100% !important;
      }
      
      /* Ensure all teams are visible by making the calendar wide enough */
      .weekly-view-calendar .fc-datagrid {
        overflow: visible !important;
        min-width: fit-content !important;
      }
      
      .weekly-view-calendar .fc-scroller {
        overflow-x: auto !important;
        overflow-y: auto !important;
      }
      
      /* Make resource headers visible and properly sized */
      .fc-col-header-cell {
        min-width: 120px !important;
        width: 120px !important;
        max-width: 120px !important;
      }
      
      /* Force resource timeline to show */
      .fc-resource-timeline {
        display: block !important;
      }
      
      /* Ensure resource area has proper minimum width */
      .weekly-view-calendar .fc-resource-area {
        min-width: calc(120px * var(--team-count, 2)) !important;
        width: auto !important;
        flex-shrink: 0 !important;
      }
    `}
  </style>
);
