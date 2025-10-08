
import React from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Edit3, Square, Circle, Minus, Trash2, Palette, ChevronDown, Pen } from 'lucide-react';
import { colorOptions } from './MapUtils';

interface MapDrawingControlsProps {
  isDrawingOpen: boolean;
  setIsDrawingOpen: (open: boolean) => void;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  drawMode: string;
  setDrawingMode: (mode: string) => void;
  isFreehandDrawing: boolean;
  toggleFreehandDrawing: () => void;
  clearAllDrawings: () => void;
}

export const MapDrawingControls: React.FC<MapDrawingControlsProps> = ({
  isDrawingOpen,
  setIsDrawingOpen,
  selectedColor,
  setSelectedColor,
  drawMode,
  setDrawingMode,
  isFreehandDrawing,
  toggleFreehandDrawing,
  clearAllDrawings
}) => {
  return (
    <Collapsible open={isDrawingOpen} onOpenChange={setIsDrawingOpen}>
      <CollapsibleTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="bg-white/90 backdrop-blur-sm shadow-md w-full justify-between"
        >
          <div className="flex items-center">
            <Edit3 className="h-4 w-4 mr-1" />
            Drawing Tools
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isDrawingOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-2 mt-2">
        {/* Color Picker */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 mb-1">
            <Palette className="h-4 w-4" />
            <span className="text-xs font-medium">Color:</span>
          </div>
          <div className="grid grid-cols-5 gap-1 p-2 bg-white/90 backdrop-blur-sm rounded-md shadow-md">
            {colorOptions.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-6 h-6 rounded-sm border-2 ${
                  selectedColor === color ? 'border-gray-800' : 'border-white'
                } hover:scale-110 transition-transform`}
                style={{ backgroundColor: color }}
                title={`Select ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Drawing Mode Controls */}
        <div className="flex flex-col gap-1">
          <Button
            onClick={() => setDrawingMode('simple_select')}
            size="sm"
            variant={drawMode === 'simple_select' ? "default" : "outline"}
            className={`bg-white/90 backdrop-blur-sm shadow-md ${
              drawMode === 'simple_select' ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
            }`}
          >
            <Edit3 className="h-4 w-4 mr-1" />
            Select
          </Button>
          
          <Button
            onClick={toggleFreehandDrawing}
            size="sm"
            variant={isFreehandDrawing ? "default" : "outline"}
            className={`bg-white/90 backdrop-blur-sm shadow-md ${
              isFreehandDrawing ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
            }`}
          >
            <Pen className="h-4 w-4 mr-1" />
            Freehand
          </Button>
          
          <Button
            onClick={() => setDrawingMode('draw_polygon')}
            size="sm"
            variant={drawMode === 'draw_polygon' ? "default" : "outline"}
            className={`bg-white/90 backdrop-blur-sm shadow-md ${
              drawMode === 'draw_polygon' ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
            }`}
          >
            <Square className="h-4 w-4 mr-1" />
            Polygon
          </Button>
          
          <Button
            onClick={() => setDrawingMode('draw_line_string')}
            size="sm"
            variant={drawMode === 'draw_line_string' ? "default" : "outline"}
            className={`bg-white/90 backdrop-blur-sm shadow-md ${
              drawMode === 'draw_line_string' ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
            }`}
          >
            <Minus className="h-4 w-4 mr-1" />
            Line
          </Button>
          
          <Button
            onClick={() => setDrawingMode('draw_point')}
            size="sm"
            variant={drawMode === 'draw_point' ? "default" : "outline"}
            className={`bg-white/90 backdrop-blur-sm shadow-md ${
              drawMode === 'draw_point' ? 'bg-teal-500 text-white hover:bg-teal-600' : ''
            }`}
          >
            <Circle className="h-4 w-4 mr-1" />
            Point
          </Button>
        </div>

        {/* Clear Controls */}
        <div className="flex flex-col gap-1 border-t border-white/20 pt-2">
          <Button
            onClick={clearAllDrawings}
            size="sm"
            variant="outline"
            className="bg-white/90 backdrop-blur-sm shadow-md text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
