
import { useState, useEffect, useMemo } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';

interface DynamicSizingConfig {
  columnWidth: number;
  dayContainerWidth: number;
  totalCalendarWidth: number;
  timeAxisWidth: number;
  cssVariables: Record<string, string>;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
}

export const useDynamicColumnSizing = (
  resources: Resource[],
  viewportWidth?: number,
  minColumnWidth: number = 80,
  maxColumnWidth: number = 200
): DynamicSizingConfig => {
  const [windowWidth, setWindowWidth] = useState(
    viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200)
  );
  
  const [zoomLevel, setZoomLevel] = useState(1.0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const config = useMemo(() => {
    const timeAxisWidth = 80; // Fixed time axis width
    const padding = 40; // Total padding/margins
    
    // Use 85% of the available width to ensure all columns fit
    const usableWidth = (windowWidth - timeAxisWidth - padding) * 0.85;
    const availableWidth = usableWidth * zoomLevel;
    
    // Calculate optimal column width based on available space and number of resources
    const teamCount = resources.length || 6; // Default to 6 teams
    const calculatedColumnWidth = Math.floor(availableWidth / teamCount);
    
    // Ensure column width stays within min/max bounds
    const columnWidth = Math.max(minColumnWidth, Math.min(maxColumnWidth, calculatedColumnWidth));
    
    // Calculate total widths based on actual column width used
    const totalCalendarWidth = (columnWidth * teamCount) + timeAxisWidth;
    const dayContainerWidth = totalCalendarWidth + 20; // Small margin

    const cssVariables = {
      '--dynamic-column-width': `${columnWidth}px`,
      '--dynamic-day-container-width': `${dayContainerWidth}px`,
      '--dynamic-total-calendar-width': `${totalCalendarWidth}px`,
      '--dynamic-time-axis-width': `${timeAxisWidth}px`,
      '--zoom-level': zoomLevel.toString(),
    };

    console.log('Dynamic sizing calculated:', {
      windowWidth,
      usableWidth,
      teamCount,
      columnWidth,
      totalCalendarWidth,
      zoomLevel
    });

    return {
      columnWidth,
      dayContainerWidth,
      totalCalendarWidth,
      timeAxisWidth,
      cssVariables,
      zoomLevel,
      setZoomLevel,
    };
  }, [windowWidth, resources.length, minColumnWidth, maxColumnWidth, zoomLevel]);

  return config;
};
