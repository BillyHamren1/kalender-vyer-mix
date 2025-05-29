import React, { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage, Rect, Circle } from 'fabric';
import { Button } from '@/components/ui/button';
import { 
  Pen, 
  Square, 
  Circle as CircleIcon, 
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
  const [brushSize, setBrushSize] = useState(2); // Reduced from 3 to 2
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !imageData) return;

    console.log('🎨 Initializing drawing canvas with image data...');

    // Create a larger canvas to accommodate different image sizes
    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1000,
      height: 700,
      backgroundColor: '#f0f0f0',
    });

    // Set smaller control sizes for all objects
    canvas.on('object:added', (e) => {
      if (e.target) {
        e.target.set({
          cornerSize: 8, // Reduced from default 13
          cornerStrokeColor: '#0066cc',
          cornerColor: '#ffffff',
          borderColor: '#0066cc',
          borderOpacityWhenMoving: 0.5,
          transparentCorners: false,
        });
      }
    });

    console.log('📸 Loading map image into drawing canvas...');

    // Load the map image as background
    FabricImage.fromURL(imageData, {
      crossOrigin: 'anonymous'
    }).then((img) => {
      console.log('✅ Image loaded successfully:', {
        originalWidth: img.width,
        originalHeight: img.height
      });

      // Calculate scale to fit image within canvas while maintaining aspect ratio
      const maxWidth = canvas.width! - 40; // Leave some padding
      const maxHeight = canvas.height! - 40;
      
      const scaleX = maxWidth / img.width!;
      const scaleY = maxHeight / img.height!;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down if needed

      console.log('📐 Calculated scale:', scale);

      // Apply scaling
      img.scale(scale);
      
      // Center the image on the canvas
      const scaledWidth = img.width! * scale;
      const scaledHeight = img.height! * scale;
      
      img.set({
        left: (canvas.width! - scaledWidth) / 2,
        top: (canvas.height! - scaledHeight) / 2,
        selectable: false,
        evented: false,
        lockMovementX: true,
        lockMovementY: true,
        hoverCursor: 'default',
        moveCursor: 'default'
      });
      
      // Add image to canvas and send to back
      canvas.add(img);
      canvas.sendObjectToBack(img);
      canvas.renderAll();
      
      console.log('🖼️ Image added to canvas at position:', {
        left: img.left,
        top: img.top,
        scaledWidth,
        scaledHeight
      });

      setImageLoaded(true);
      
      // Save initial state to history
      saveCanvasState();
    }).catch((error) => {
      console.error('❌ Error loading image into canvas:', error);
      setImageLoaded(false);
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, [imageData]);

  // FIXED: Update drawing mode AND brush properties when either changes
  useEffect(() => {
    if (!fabricCanvas) return;

    console.log('🎨 Updating drawing mode and brush properties:', {
      drawingMode,
      brushColor,
      brushSize
    });

    fabricCanvas.isDrawingMode = drawingMode === 'draw';
    
    if (fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = brushColor;
      fabricCanvas.freeDrawingBrush.width = brushSize;
      console.log('✅ Updated free drawing brush:', {
        color: fabricCanvas.freeDrawingBrush.color,
        width: fabricCanvas.freeDrawingBrush.width
      });
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
      
      console.log('🔲 Creating shape with color:', brushColor);
      
      if (drawingMode === 'rectangle') {
        const rect = new Rect({
          left: pointer.x,
          top: pointer.y,
          width: 20, // Reduced from 50 to 20
          height: 20, // Reduced from 50 to 20
          fill: 'transparent',
          stroke: brushColor,
          strokeWidth: brushSize,
          cornerSize: 8, // Smaller control handles
          cornerStrokeColor: '#0066cc',
          cornerColor: '#ffffff',
          borderColor: '#0066cc',
          transparentCorners: false,
        });
        fabricCanvas.add(rect);
        console.log('✅ Rectangle created with stroke color:', rect.stroke);
      } else if (drawingMode === 'circle') {
        const circle = new Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 10, // Reduced from 25 to 10
          fill: 'transparent',
          stroke: brushColor,
          strokeWidth: brushSize,
          cornerSize: 8, // Smaller control handles
          cornerStrokeColor: '#0066cc',
          cornerColor: '#ffffff',
          borderColor: '#0066cc',
          transparentCorners: false,
        });
        fabricCanvas.add(circle);
        console.log('✅ Circle created with stroke color:', circle.stroke);
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

  // FIXED: Add color change handler with logging
  const handleColorChange = (color: string) => {
    console.log('🎨 Color changed from', brushColor, 'to', color);
    setBrushColor(color);
  };

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
      fabricCanvas.sendObjectToBack(backgroundImage);
    }
    fabricCanvas.renderAll();
    saveCanvasState();
  };

  const handleSave = () => {
    if (!fabricCanvas) return;
    
    console.log('💾 Exporting annotated image...');
    
    // Export canvas as image with high quality
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    
    console.log('✅ Annotated image exported, size:', Math.round(dataURL.length / 1024), 'KB');
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
            <CircleIcon className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          {/* Brush Size */}
          <div className="flex items-center gap-2">
            <span className="text-sm">Size:</span>
            <input
              type="range"
              min="1"
              max="15" // Reduced from 20 to 15
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
          <Button onClick={handleSave} disabled={!imageLoaded}>
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
            } hover:scale-110 transition-transform`}
            style={{ backgroundColor: color }}
            onClick={() => handleColorChange(color)}
          />
        ))}
        <input
          type="color"
          value={brushColor}
          onChange={(e) => handleColorChange(e.target.value)}
          className="w-6 h-6 rounded border border-gray-300 ml-2"
        />
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center bg-gray-100 p-4">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 z-10">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <span className="text-gray-600">Loading image for editing...</span>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="border border-gray-300 shadow-lg bg-white" />
      </div>
    </div>
  );
};
