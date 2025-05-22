
import React from 'react';
import { ResourceHeaderDropZone } from '../ResourceHeaderDropZone';

export const ResourceHeaderRenderer = {
  setupStyles: (info: any) => {
    // Apply styles to ensure consistent resource header appearance
    const htmlElement = info.el as HTMLElement;
    htmlElement.style.display = 'flex';
    htmlElement.style.justifyContent = 'center';
    htmlElement.style.width = '100%';
    
    // Ensure cushion takes full width
    const cushion = info.el.querySelector('.fc-datagrid-cell-cushion');
    if (cushion) {
      const cushionElement = cushion as HTMLElement;
      cushionElement.style.width = '100%';
      cushionElement.style.textAlign = 'center';
    }
    
    // Ensure all children of the resource cell main div are centered
    const main = info.el.closest('.fc-datagrid-cell-main');
    if (main) {
      const mainElement = main as HTMLElement;
      mainElement.style.display = 'flex';
      mainElement.style.flexDirection = 'column';
      mainElement.style.alignItems = 'center';
      mainElement.style.width = '100%';
    }
  },
  
  renderContent: (
    info: any, 
    isMobile: boolean, 
    currentDate: Date, 
    onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>,
    forceRefresh?: boolean
  ) => {
    if (isMobile) return info.resource.title;
    
    return (
      <ResourceHeaderDropZone 
        resource={info.resource}
        currentDate={currentDate}
        onStaffDrop={onStaffDrop}
        forceRefresh={forceRefresh}
      />
    );
  }
};
