
import React from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CalendarZoomControlsProps {
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  minZoom?: number;
  maxZoom?: number;
}

export const CalendarZoomControls: React.FC<CalendarZoomControlsProps> = ({
  zoomLevel,
  onZoomChange,
  minZoom = 0.5,
  maxZoom = 3.0
}) => {
  const handleZoomIn = () => {
    const newZoom = Math.min(maxZoom, zoomLevel + 0.2);
    console.log('Zooming in to:', newZoom);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(minZoom, zoomLevel - 0.2);
    console.log('Zooming out to:', newZoom);
    onZoomChange(newZoom);
  };

  const handleReset = () => {
    console.log('Resetting zoom to 1.0');
    onZoomChange(1.0);
  };

  const zoomPercentage = Math.round(zoomLevel * 100);

  return (
    <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-lg p-2 border shadow-lg">
      <Button
        onClick={handleZoomOut}
        variant="outline"
        size="sm"
        disabled={zoomLevel <= minZoom}
        className="h-8 w-8 p-0 hover:bg-gray-100"
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      
      <span className="text-sm font-medium min-w-[3.5rem] text-center px-2 py-1 bg-gray-50 rounded">
        {zoomPercentage}%
      </span>
      
      <Button
        onClick={handleZoomIn}
        variant="outline"
        size="sm"
        disabled={zoomLevel >= maxZoom}
        className="h-8 w-8 p-0 hover:bg-gray-100"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      
      <Button
        onClick={handleReset}
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-gray-100"
        title="Reset zoom to 100%"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
};

