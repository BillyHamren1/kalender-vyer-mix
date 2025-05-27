
import React from 'react';

interface DynamicResourceStylesProps {
  cssVariables: Record<string, string>;
}

export const DynamicResourceStyles: React.FC<DynamicResourceStylesProps> = ({ cssVariables }) => {
  const cssText = `
    /* Dynamic column sizing using CSS variables */
    .dynamic-calendar-container {
      width: var(--dynamic-total-calendar-width);
      min-width: var(--dynamic-total-calendar-width);
      max-width: var(--dynamic-total-calendar-width);
    }
    
    .dynamic-day-wrapper {
      width: var(--dynamic-day-container-width);
      min-width: var(--dynamic-day-container-width);
      max-width: var(--dynamic-day-container-width);
      flex: 0 0 var(--dynamic-day-container-width);
    }
    
    /* Zoom-responsive staff badges */
    .zoom-responsive-badge {
      font-size: calc(10px * var(--zoom-level, 1)) !important;
      min-height: calc(18px * var(--zoom-level, 1)) !important;
      padding: calc(2px * var(--zoom-level, 1)) calc(6px * var(--zoom-level, 1)) !important;
      border-radius: calc(3px * var(--zoom-level, 1)) !important;
      line-height: 1 !important;
    }
    
    /* Resource column widths - ensure they fit exactly */
    .dynamic-resource-columns .fc-resource-area td,
    .dynamic-resource-columns .fc-resource-area th,
    .dynamic-resource-columns .fc-resource-lane,
    .dynamic-resource-columns .fc-datagrid-cell,
    .dynamic-resource-columns .fc-datagrid-cell-frame,
    .dynamic-resource-columns .fc-datagrid-cell-cushion,
    .dynamic-resource-columns .fc-timegrid-col,
    .dynamic-resource-columns .fc-col-header-cell {
      min-width: var(--dynamic-column-width) !important;
      width: var(--dynamic-column-width) !important;
      max-width: var(--dynamic-column-width) !important;
      box-sizing: border-box !important;
    }
    
    /* Time axis width */
    .dynamic-resource-columns .fc-timegrid-axis {
      width: var(--dynamic-time-axis-width) !important;
      min-width: var(--dynamic-time-axis-width) !important;
      max-width: var(--dynamic-time-axis-width) !important;
    }
    
    /* Header alignment */
    .dynamic-resource-columns .fc-datagrid-header .fc-datagrid-cell,
    .dynamic-resource-columns .fc-datagrid-header .fc-datagrid-cell-frame,
    .dynamic-resource-columns .fc-datagrid-body .fc-datagrid-cell,
    .dynamic-resource-columns .fc-datagrid-body .fc-datagrid-cell-frame {
      min-width: var(--dynamic-column-width) !important;
      width: var(--dynamic-column-width) !important;
      max-width: var(--dynamic-column-width) !important;
    }
    
    /* Ensure events stay within columns */
    .dynamic-resource-columns .fc-timeline-event,
    .dynamic-resource-columns .fc-timegrid-event {
      max-width: calc(var(--dynamic-column-width) - 4px) !important;
      margin-left: 2px !important;
      margin-right: 2px !important;
    }
    
    /* Ensure the calendar scrolls properly */
    .dynamic-resource-columns .fc-scroller {
      overflow-x: visible !important;
    }
    
    /* Force exact sizing for team columns */
    .dynamic-resource-columns [data-resource-id^="team-"] .fc-datagrid-cell,
    .dynamic-resource-columns [data-resource-id^="team-"].fc-datagrid-cell,
    .dynamic-resource-columns [data-resource-id^="team-"] .fc-timegrid-col,
    .dynamic-resource-columns [data-resource-id^="team-"].fc-timegrid-col {
      min-width: var(--dynamic-column-width) !important;
      width: var(--dynamic-column-width) !important;
      max-width: var(--dynamic-column-width) !important;
    }
    
    /* Ensure resource area doesn't overflow */
    .dynamic-resource-columns .fc-resource-area {
      min-width: calc(var(--dynamic-column-width) * var(--team-count, 6)) !important;
      width: calc(var(--dynamic-column-width) * var(--team-count, 6)) !important;
      max-width: calc(var(--dynamic-column-width) * var(--team-count, 6)) !important;
    }
  `;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(cssVariables)
          .map(([key, value]) => `${key}: ${value};`)
          .join(' ') + cssText
      }}
    />
  );
};
