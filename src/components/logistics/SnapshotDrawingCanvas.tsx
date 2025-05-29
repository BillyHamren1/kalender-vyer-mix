
import React, { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
import { Button } from '@/components/ui/button';
import { 
  Pen, 
  Square, 
  Circle, 
  Undo2, 
  Redo2, 
  Eraser,
  MousePointer,
  Trash2
} from 'lucide-react';

interface SnapshotDrawingCanvasProps {
  imageData: string;
  onSave: (annotatedImageData: string) => void;
  onClose: () => void;
}

export const SnapshotDrawingCanvas: React.FC<SnapshotDrawingCanvasProps> = ({
  imageData,
  onSave,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [drawingMode, setDrawingMode] = useState<'select' | 'draw' | 'rectangle' | 'circle'>('select');
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(3);
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !imageData) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
    });

    // Load the map image as background
    FabricImage.fromURL(imageData).then((img) => {
      // Scale image to fit canvas
      const canvasAspect = canvas.width! / canvas.height!;
      const imageAspect = img.width! / img.height!;
      
      let scale;
      if (imageAspect > canvasAspect) {
        scale = canvas.width! / img.width!;
      } else {
        scale = canvas.height! / img.height!;
      }
      
      img.scale(scale);
      img.set({
        left: (canvas.width! - img.width! * scale) / 2,
        top: (canvas.height! - img.height! * scale) / 2,
        selectable: false,
        evented: false,
        lockMovementX: true,
        lockMovementY: true,
      });
      
      canvas.add(img);
      canvas.sendToBack(img);
      canvas.renderAll();
      
      // Save initial state to history
      saveCanvasState();
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, [imageData]);

  // Update drawing mode
  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = drawingMode === 'draw';
    
    if (drawingMode === 'draw' && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = brushColor;
      fabricCanvas.freeDrawingBrush.width = brushSize;
    }

    // Handle shape creation
    if (drawingMode === 'rectangle' || drawingMode === 'circle') {
      fabricCanvas.isDrawingMode = false;
    }
  }, [drawingMode, brushColor, brushSize, fabricCanvas]);

  // Save canvas state for undo/redo
  const saveCanvasState = () => {
    if (!fabricCanvas) return;
    
    const canvasJson = JSON.stringify(fabricCanvas.toJSON());
    const newHistory = canvasHistory.slice(0, historyStep + 1);
    newHistory.push(canvasJson);
    setCanvasHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  // Handle shape creation on canvas
  useEffect(() => {
    if (!fabricCanvas) return;

    const handleMouseDown = (e: any) => {
      if (drawingMode !== 'rectangle' && drawingMode !== 'circle') return;
      
      const pointer = fabricCanvas.getPointer(e.e);
      
      if (drawingMode === 'rectangle') {
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 50,
          height: 50,
          fill: 'transparent',
          stroke: brushColor,
          strokeWidth: brushSize,
        });
        fabricCanvas.add(rect);
      } else if (drawingMode === 'circle') {
        const circle = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 25,
          fill: 'transparent',
          stroke: brushColor,
          strokeWidth: brushSize,
        });
        fabricCanvas.add(circle);
      }
      
      saveCanvasState();
      setDrawingMode('select');
    };

    fabricCanvas.on('mouse:down', handleMouseDown);
    
    // Save state after drawing
    fabricCanvas.on('path:created', saveCanvasState);

    return () => {
      fabricCanvas.off('mouse:down', handleMouseDown);
      fabricCanvas.off('path:created', saveCanvasState);
    };
  }, [fabricCanvas, drawingMode, brushColor, brushSize]);

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      fabricCanvas?.loadFromJSON(canvasHistory[historyStep - 1], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  const handleRedo = () => {
    if (historyStep < canvasHistory.length - 1) {
      setHistoryStep(historyStep + 1);
      fabricCanvas?.loadFromJSON(canvasHistory[historyStep + 1], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    
    // Remove all objects except the background image
    const objects = fabricCanvas.getObjects();
    const backgroundImage = objects[0]; // First object should be the map image
    
    fabricCanvas.clear();
    if (backgroundImage) {
      fabricCanvas.add(backgroundImage);
      fabricCanvas.sendToBack(backgroundImage);
    }
    fabricCanvas.renderAll();
    saveCanvasState();
  };

  const handleSave = () => {
    if (!fabricCanvas) return;
    
    // Export canvas as image
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    
    onSave(dataURL);
  };

  const colors = [
    '#ff0000', '#00ff00', '#0000ff', '#ffff00', 
    '#ff00ff', '#00ffff', '#000000', '#ffffff',
    '#ff8800', '#8800ff', '#00ff88', '#888888'
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          {/* Drawing Tools */}
          <Button
            variant={drawingMode === 'select' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDrawingMode('select')}
          >
            <MousePointer className="h-4 w-4" />
          </Button>
          
          <Button
            variant={drawingMode === 'draw' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDrawingMode('draw')}
          >
            <Pen className="h-4 w-4" />
          </Button>
          
          <Button
            variant={drawingMode === 'rectangle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDrawingMode('rectangle')}
          >
            <Square className="h-4 w-4" />
          </Button>
          
          <Button
            variant={drawingMode === 'circle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDrawingMode('circle')}
          >
            <Circle className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          {/* Brush Size */}
          <div className="flex items-center gap-2">
            <span className="text-sm">Size:</span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-16"
            />
            <span className="text-xs w-6">{brushSize}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={historyStep <= 0}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={historyStep >= canvasHistory.length - 1}
          >
            <Redo2 className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Annotated Image
          </Button>
        </div>
      </div>

      {/* Color Palette */}
      <div className="flex items-center gap-1 p-2 bg-gray-50 border-b">
        <span className="text-sm mr-2">Color:</span>
        {colors.map((color) => (
          <button
            key={color}
            className={`w-6 h-6 rounded border-2 ${
              brushColor === color ? 'border-gray-800' : 'border-gray-300'
            }`}
            style={{ backgroundColor: color }}
            onClick={() => setBrushColor(color)}
          />
        ))}
        <input
          type="color"
          value={brushColor}
          onChange={(e) => setBrushColor(e.target.value)}
          className="w-6 h-6 rounded border border-gray-300 ml-2"
        />
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center bg-gray-100 p-4">
        <canvas ref={canvasRef} className="border border-gray-300 shadow-lg bg-white" />
      </div>
    </div>
  );
};
