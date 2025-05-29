
import React from 'react';
import { Button } from '@/components/ui/button';
import { Mountain, Ruler, RotateCcw, Camera, Satellite, Map } from 'lucide-react';
import { MapDrawingControls } from './MapDrawingControls';

interface MapControlsProps {
  is3DEnabled: boolean;
  toggle3D: () => void;
  isMeasuring: boolean;
  toggleMeasuring: () => void;
  selectedBooking: any;
  takeMapSnapshot: () => void;
  isCapturingSnapshot: boolean;
  resetView: () => void;
  isDrawingOpen: boolean;
  setIsDrawingOpen: (open: boolean) => void;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  drawMode: string;
  setDrawingMode: (mode: string) => void;
  isFreehandDrawing: boolean;
  toggleFreehandDrawing: () => void;
  clearAllDrawings: () => void;
  currentMapStyle: string;
  toggleMapStyle: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  is3DEnabled,
  toggle3D,
  isMeasuring,
  toggleMeasuring,
  selectedBooking,
  takeMapSnapshot,
  isCapturingSnapshot,
  resetView,
  isDrawingOpen,
  setIsDrawingOpen,
  selectedColor,
  setSelectedColor,
  drawMode,
  setDrawingMode,
  isFreehandDrawing,
  toggleFreehandDrawing,
  clearAllDrawings,
  currentMapStyle,
  toggleMapStyle
}) => {
  const isSatelliteView = currentMapStyle.includes('satellite');

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
      {/* Basic Controls (always visible) */}
      <div className="flex flex-col gap-1">
        <Button
          onClick={toggle3D}
          size="sm"
          variant={is3DEnabled ? "default" : "outline"}
          className="bg-white/90 backdrop-blur-sm shadow-md"
        >
          <Mountain className="h-4 w-4 mr-1" />
          3D Terrain
        </Button>

        <Button
          onClick={toggleMapStyle}
          size="sm"
          variant="outline"
          className="bg-white/90 backdrop-blur-sm shadow-md"
        >
          {isSatelliteView ? (
            <>
              <Map className="h-4 w-4 mr-1" />
              Streets
            </>
          ) : (
            <>
              <Satellite className="h-4 w-4 mr-1" />
              Satellite
            </>
          )}
        </Button>
        
        <Button
          onClick={toggleMeasuring}
          size="sm"
          variant={isMeasuring ? "default" : "outline"}
          className={`bg-white/90 backdrop-blur-sm shadow-md ${
            isMeasuring ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
          }`}
        >
          <Ruler className="h-4 w-4 mr-1" />
          Measure
        </Button>

        {/* Snapshot Button - Only show when a booking is selected */}
        {selectedBooking && (
          <Button
            onClick={takeMapSnapshot}
            size="sm"
            variant="outline"
            disabled={isCapturingSnapshot}
            className="bg-white/90 backdrop-blur-sm shadow-md"
          >
            <Camera className="h-4 w-4 mr-1" />
            {isCapturingSnapshot ? 'Capturing...' : 'Snapshot'}
          </Button>
        )}
      </div>

      {/* Collapsible Drawing Controls */}
      <MapDrawingControls
        isDrawingOpen={isDrawingOpen}
        setIsDrawingOpen={setIsDrawingOpen}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        drawMode={drawMode}
        setDrawingMode={setDrawingMode}
        isFreehandDrawing={isFreehandDrawing}
        toggleFreehandDrawing={toggleFreehandDrawing}
        clearAllDrawings={clearAllDrawings}
      />

      {/* Reset Control */}
      <Button
        onClick={resetView}
        size="sm"
        variant="outline"
        className="bg-white/90 backdrop-blur-sm shadow-md"
      >
        <RotateCcw className="h-4 w-4 mr-1" />
        Reset
      </Button>
    </div>
  );
};
