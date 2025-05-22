
import React from 'react';

export const CalendarStylesheet: React.FC = () => (
  <style>
    {`
      .event-delivery-address {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
        max-height: none !important;
        white-space: normal !important;
        color: #000000e6 !important;
      }
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
        color: #000000e6 !important;
      }
      .fc-event-time {
        white-space: nowrap;
        color: #000000e6 !important;
      }
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
        color: #000000e6 !important;
      }
      .fc-timegrid-event .fc-event-main {
        padding: 2px 4px !important;
        color: #000000e6 !important;
      }
      /* Force consistent column widths - INCREASED */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-timegrid-col {
        min-width: 130px !important;
        width: 130px !important;
        max-width: 130px !important;
      }
      /* Special handling for team-6 - INCREASED */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 130px !important;
        width: 130px !important;
        max-width: 130px !important;
      }
      /* Ensure all event text is black */
      .fc-event *, 
      .fc-timegrid-event *, 
      .fc-daygrid-event *,
      .event-client-name,
      .event-street,
      .event-city,
      .event-booking-id {
        color: #000000e6 !important;
      }
      /* Style for potential duplicate events - REMOVING RED LEFT BORDER */
      .fc-event[data-has-booking-id="true"] {
        /* Removing the red left border */
        border-left: none !important;
      }
      /* Hide action buttons by default, show on hover */
      .event-actions {
        display: none;
      }
      .fc-event:hover .event-actions {
        display: flex;
      }
      /* Style for delete button */
      .delete-event-btn:hover {
        color: #e11d48;
      }
    `}
  </style>
);
