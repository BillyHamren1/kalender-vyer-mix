
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
      /* CRITICAL: Force ALL resource columns to be exactly 200px - highest specificity */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion,
      .fc-timegrid-col,
      .fc-col-header-cell {
        min-width: 200px !important;
        width: 200px !important;
        max-width: 200px !important;
        box-sizing: border-box !important;
      }
      /* Ensure header area matches content area exactly */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 200px !important;
        width: 200px !important;
        max-width: 200px !important;
      }
      /* Special handling for team-6 to ensure consistency */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-datagrid-cell-frame,
      [data-resource-id="team-6"].fc-datagrid-cell-frame,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 200px !important;
        width: 200px !important;
        max-width: 200px !important;
      }
    `}
  </style>
);
