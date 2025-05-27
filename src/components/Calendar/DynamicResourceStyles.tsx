
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
    }
    
    .dynamic-day-wrapper {
      width: var(--dynamic-day-container-width);
      min-width: var(--dynamic-day-container-width);
      flex: 0 0 var(--dynamic-day-container-width);
    }
    
    /* Resource column widths */
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
    
    /* Special handling for team-6 */
    .dynamic-resource-columns [data-resource-id="team-6"] .fc-datagrid-cell,
    .dynamic-resource-columns [data-resource-id="team-6"].fc-datagrid-cell,
    .dynamic-resource-columns [data-resource-id="team-6"] .fc-timegrid-col,
    .dynamic-resource-columns [data-resource-id="team-6"].fc-timegrid-col {
      min-width: var(--dynamic-column-width) !important;
      width: var(--dynamic-column-width) !important;
      max-width: var(--dynamic-column-width) !important;
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
