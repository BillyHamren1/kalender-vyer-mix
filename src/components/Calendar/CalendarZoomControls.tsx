
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
    const newZoom = Math.min(maxZoom, zoomLevel + 0.25);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(minZoom, zoomLevel - 0.25);
    onZoomChange(newZoom);
  };

  const handleReset = () => {
    onZoomChange(1.0);
  };

  const zoomPercentage = Math.round(zoomLevel * 100);

  return (
    <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg p-2 border shadow-sm">
      <Button
        onClick={handleZoomOut}
        variant="outline"
        size="sm"
        disabled={zoomLevel <= minZoom}
        className="h-8 w-8 p-0"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      
      <span className="text-sm font-medium min-w-[3rem] text-center">
        {zoomPercentage}%
      </span>
      
      <Button
        onClick={handleZoomIn}
        variant="outline"
        size="sm"
        disabled={zoomLevel >= maxZoom}
        className="h-8 w-8 p-0"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      
      <Button
        onClick={handleReset}
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        title="Reset zoom"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
};
