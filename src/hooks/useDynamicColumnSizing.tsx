
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
  minColumnWidth: number = 120,
  maxColumnWidth: number = 300
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
    
    // Use about 33% of screen width for each column as requested
    const usableWidth = windowWidth - timeAxisWidth - padding;
    const teamCount = resources.length || 6; // Default to 6 teams
    
    // Calculate base column width (33% of available space divided by teams)
    const baseColumnWidth = Math.floor((usableWidth * 0.33) / teamCount);
    
    // Apply zoom to the base width
    const zoomedColumnWidth = Math.floor(baseColumnWidth * zoomLevel);
    
    // Ensure column width stays within min/max bounds
    const columnWidth = Math.max(minColumnWidth, Math.min(maxColumnWidth, zoomedColumnWidth));
    
    // Calculate total widths based on actual column width used
    const totalCalendarWidth = (columnWidth * teamCount) + timeAxisWidth;
    const dayContainerWidth = totalCalendarWidth + 20; // Small margin

    const cssVariables = {
      '--dynamic-column-width': `${columnWidth}px`,
      '--dynamic-day-container-width': `${dayContainerWidth}px`,
      '--dynamic-total-calendar-width': `${totalCalendarWidth}px`,
      '--dynamic-time-axis-width': `${timeAxisWidth}px`,
      '--zoom-level': zoomLevel.toString(),
      '--team-count': teamCount.toString(),
    };

    console.log('Dynamic sizing calculated:', {
      windowWidth,
      usableWidth,
      teamCount,
      baseColumnWidth,
      zoomedColumnWidth,
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

