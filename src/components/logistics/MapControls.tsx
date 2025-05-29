import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mountain, 
  Ruler, 
  Camera, 
  RotateCcw, 
  Palette, 
  Square, 
  CircleDot, 
  Pencil, 
  Trash2,
  Map,
  Layers,
  RulerIcon
} from 'lucide-react';
import { MapDrawingControls } from './MapDrawingControls';
import { colorOptions } from './MapUtils';

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
  showPolygonMeasurements: boolean;
  togglePolygonMeasurements: () => void;
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
  toggleMapStyle,
  showPolygonMeasurements,
  togglePolygonMeasurements
}) => {
  return (
    <>
      {/* Main Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Card className="p-2 shadow-lg">
          <CardContent className="p-0 flex flex-col gap-1">
            {/* Map Style Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMapStyle}
              className="w-full justify-start gap-2"
            >
              <Layers className="h-4 w-4" />
              {currentMapStyle.includes('satellite') ? 'Satellite' : 'Streets'}
            </Button>

            {/* 3D Toggle */}
            <Button
              variant={is3DEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggle3D}
              className="w-full justify-start gap-2"
            >
              <Mountain className="h-4 w-4" />
              3D Terrain
            </Button>

            {/* Measuring Tool */}
            <Button
              variant={isMeasuring ? "default" : "outline"}
              size="sm"
              onClick={toggleMeasuring}
              className="w-full justify-start gap-2"
            >
              <Ruler className="h-4 w-4" />
              Measure
            </Button>

            {/* Polygon Measurements Toggle */}
            <Button
              variant={showPolygonMeasurements ? "default" : "outline"}
              size="sm"
              onClick={togglePolygonMeasurements}
              className="w-full justify-start gap-2"
            >
              <Square className="h-4 w-4" />
              Polygon Measure
            </Button>

            {/* Drawing Controls Toggle */}
            <Button
              variant={isDrawingOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setIsDrawingOpen(!isDrawingOpen)}
              className="w-full justify-start gap-2"
            >
              <Pencil className="h-4 w-4" />
              Drawing Tools
            </Button>

            {/* Map Snapshot */}
            {selectedBooking && (
              <Button
                variant="outline"
                size="sm"
                onClick={takeMapSnapshot}
                disabled={isCapturingSnapshot}
                className="w-full justify-start gap-2"
              >
                <Camera className="h-4 w-4" />
                {isCapturingSnapshot ? 'Capturing...' : 'Snapshot'}
              </Button>
            )}

            {/* Reset View */}
            <Button
              variant="outline"
              size="sm"
              onClick={resetView}
              className="w-full justify-start gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset View
            </Button>
          </CardContent>
        </Card>

        {/* Status Indicators */}
        <div className="flex flex-col gap-1">
          {isMeasuring && (
            <Badge variant="default" className="bg-red-500">
              Measuring Active
            </Badge>
          )}
          {isFreehandDrawing && (
            <Badge variant="default" className="bg-green-500">
              Freehand Drawing
            </Badge>
          )}
          {showPolygonMeasurements && (
            <Badge variant="default" className="bg-blue-500">
              Polygon Measurements
            </Badge>
          )}
          {drawMode !== 'simple_select' && (
            <Badge variant="default" className="bg-purple-500">
              Drawing: {drawMode.replace('draw_', '').replace('_', ' ')}
            </Badge>
          )}
        </div>
      </div>

      {/* Drawing Controls Panel */}
      {isDrawingOpen && (
        <MapDrawingControls
          selectedColor={selectedColor}
          setSelectedColor={setSelectedColor}
          drawMode={drawMode}
          setDrawingMode={setDrawingMode}
          isFreehandDrawing={isFreehandDrawing}
          toggleFreehandDrawing={toggleFreehandDrawing}
          clearAllDrawings={clearAllDrawings}
        />
      )}
    </>
  );
};
