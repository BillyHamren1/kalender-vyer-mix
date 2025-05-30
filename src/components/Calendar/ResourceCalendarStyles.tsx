
import React from 'react';

// Custom styles to ensure addresses wrap properly and CONSISTENT COLUMN WIDTHS with synchronized headers
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
      /* CRITICAL: Force ALL resource columns to be exactly 80px - highest specificity */
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
      /* Special handling for team-6 to ensure consistency */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-datagrid-cell-frame,
      [data-resource-id="team-6"].fc-datagrid-cell-frame,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }

      /* NEW: Synchronized calendar alignment styles */
      .synchronized-calendars {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 1px;
        align-items: start;
      }

      .synchronized-calendars .day-calendar-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }

      /* Ensure all time slots align across calendars */
      .synchronized-calendars .fc-timegrid-slot {
        height: 30px !important;
        border-bottom: 1px solid #e0e0e0 !important;
      }

      /* Force consistent resource header heights */
      .synchronized-calendars .fc-datagrid-cell-cushion {
        display: flex !important;
        align-items: stretch !important;
        min-height: var(--resource-header-height, 80px) !important;
        height: var(--resource-header-height, 80px) !important;
        max-height: var(--resource-header-height, 80px) !important;
      }

      /* Ensure time grid aligns with resource headers */
      .synchronized-calendars .fc-timegrid-axis {
        width: 80px !important;
        min-width: 80px !important;
        max-width: 80px !important;
      }

      /* Synchronize border styles */
      .synchronized-calendars .fc-scrollgrid-section {
        border-color: #e0e0e0 !important;
      }

      /* Weekly view specific alignment */
      .weekly-view-container .synchronized-calendars {
        height: 100%;
      }

      .weekly-view-container .day-calendar-wrapper {
        height: 100%;
        border-right: 1px solid #e0e0e0;
      }

      .weekly-view-container .day-calendar-wrapper:last-child {
        border-right: none;
      }

      /* Ensure consistent time axis width across all days */
      .synchronized-calendars .fc-timegrid-axis-cushion {
        width: 80px !important;
        text-align: center !important;
        padding: 4px !important;
      }
    `}
  </style>
);
