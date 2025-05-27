
import React from 'react';

// Custom styles with dynamic sizing support - maintains backward compatibility
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
      
      /* Fallback styles for non-dynamic containers - DEFAULT: 150px for 5 teams */
      .fc-resource-area td:not(.dynamic-resource-columns *),
      .fc-resource-area th:not(.dynamic-resource-columns *),
      .fc-resource-lane:not(.dynamic-resource-columns *),
      .fc-datagrid-cell:not(.dynamic-resource-columns *),
      .fc-datagrid-cell-frame:not(.dynamic-resource-columns *),
      .fc-datagrid-cell-cushion:not(.dynamic-resource-columns *),
      .fc-timegrid-col:not(.dynamic-resource-columns *),
      .fc-col-header-cell:not(.dynamic-resource-columns *) {
        min-width: 150px !important;
        width: 150px !important;
        max-width: 150px !important;
        box-sizing: border-box !important;
      }
      
      /* Ensure header area matches content area exactly for fallback */
      .fc-datagrid-header .fc-datagrid-cell:not(.dynamic-resource-columns *),
      .fc-datagrid-header .fc-datagrid-cell-frame:not(.dynamic-resource-columns *),
      .fc-datagrid-body .fc-datagrid-cell:not(.dynamic-resource-columns *),
      .fc-datagrid-body .fc-datagrid-cell-frame:not(.dynamic-resource-columns *) {
        min-width: 150px !important;
        width: 150px !important;
        max-width: 150px !important;
      }
      
      /* Special handling for team-6 fallback */
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *) .fc-datagrid-cell,
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *).fc-datagrid-cell,
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *) .fc-datagrid-cell-frame,
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *).fc-datagrid-cell-frame,
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *) .fc-timegrid-col,
      [data-resource-id="team-6"]:not(.dynamic-resource-columns *).fc-timegrid-col {
        min-width: 150px !important;
        width: 150px !important;
        max-width: 150px !important;
      }
    `}
  </style>
);
