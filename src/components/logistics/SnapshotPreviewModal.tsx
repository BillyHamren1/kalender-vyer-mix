
import React, { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, FabricText, Circle, Rect, PencilBrush, FabricImage } from 'fabric';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import { 
  Pen, 
  Square, 
  Circle as CircleIcon, 
  Type, 
  Palette, 
  Undo, 
  Redo, 
  Trash2, 
  Save, 
  X,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface SnapshotPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageData: string; // Now expects an image URL instead of base64
  onSave: (annotatedImageData: string) => void;
  bookingNumber?: string;
}

const DRAWING_COLORS = [
  '#ff0000', // Red
  '#00ff00', // Green
  '#0000ff', // Blue
  '#ffff00', // Yellow
  '#ff00ff', // Magenta
  '#00ffff', // Cyan
  '#ffffff', // White
  '#000000', // Black
];

export const SnapshotPreviewModal: React.FC<SnapshotPreviewModalProps> = ({
  isOpen,
  onClose,
  imageData,
  onSave,
  bookingNumber
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pen' | 'rectangle' | 'circle' | 'text'>('select');
  const [activeColor, setActiveColor] = useState('#ff0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current || !isOpen || !imageData) return;

    console.log('Initializing canvas with image URL:', imageData);
    setIsImageLoaded(false);
    setImageLoadError(false);

    // Create fabric canvas with initial dimensions
    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
    });

    // Load the image from URL (much faster than base64)
    FabricImage.fromURL(imageData, {
      crossOrigin: 'anonymous'
    }).then((img) => {
      console.log('Image loaded successfully:', img.width, 'x', img.height);
      
      // Set canvas dimensions to match the image
      if (img.width && img.height) {
        // Scale the image to fit a reasonable viewport
        const maxWidth = 1200;
        const maxHeight = 800;
        
        let canvasWidth = img.width;
        let canvasHeight = img.height;
        
        if (img.width > maxWidth || img.height > maxHeight) {
          const scaleX = maxWidth / img.width;
          const scaleY = maxHeight / img.height;
          const scale = Math.min(scaleX, scaleY);
          
          canvasWidth = img.width * scale;
          canvasHeight = img.height * scale;
          
          img.scaleToWidth(canvasWidth);
        }
        
        canvas.setDimensions({
          width: canvasWidth,
          height: canvasHeight
        });
      }
      
      // Set the loaded image as background using v6 API
      canvas.backgroundImage = img;
      canvas.renderAll();
      setIsImageLoaded(true);
      
      console.log('Canvas background image set and rendered');
    }).catch((error) => {
      console.error('Error loading image:', error);
      setImageLoadError(true);
      toast.error('Failed to load captured image');
    });

    // Configure drawing brush
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = activeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    setFabricCanvas(canvas);
    
    // Save initial state to history after image loads
    setTimeout(() => {
      if (canvas.backgroundImage) {
        const initialState = JSON.stringify(canvas.toJSON());
        setHistory([initialState]);
        setHistoryStep(0);
      }
    }, 500);

    return () => {
      canvas.dispose();
      setIsImageLoaded(false);
      setImageLoadError(false);
    };
  }, [isOpen, imageData]);

  // Update canvas settings when tool/color changes
  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === 'pen';
    
    if (activeTool === 'pen' && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = strokeWidth;
    }

    fabricCanvas.selection = activeTool === 'select';
  }, [activeTool, activeColor, strokeWidth, fabricCanvas]);

  // Save state to history after modifications
  const saveState = () => {
    if (!fabricCanvas) return;
    
    const currentState = JSON.stringify(fabricCanvas.toJSON());
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(currentState);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  // Handle tool selection
  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (tool === 'rectangle' && fabricCanvas) {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'transparent',
        stroke: activeColor,
        strokeWidth: strokeWidth,
        width: 100,
        height: 60,
      });
      fabricCanvas.add(rect);
      saveState();
    } else if (tool === 'circle' && fabricCanvas) {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: 'transparent',
        stroke: activeColor,
        strokeWidth: strokeWidth,
        radius: 50,
      });
      fabricCanvas.add(circle);
      saveState();
    } else if (tool === 'text' && fabricCanvas) {
      const text = new FabricText('Click to edit', {
        left: 100,
        top: 100,
        fill: activeColor,
        fontSize: 20,
        fontFamily: 'Arial',
      });
      fabricCanvas.add(text);
      saveState();
    }
  };

  // Undo functionality
  const handleUndo = () => {
    if (historyStep > 0 && fabricCanvas) {
      setHistoryStep(historyStep - 1);
      fabricCanvas.loadFromJSON(history[historyStep - 1], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  // Redo functionality
  const handleRedo = () => {
    if (historyStep < history.length - 1 && fabricCanvas) {
      setHistoryStep(historyStep + 1);
      fabricCanvas.loadFromJSON(history[historyStep + 1], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  // Clear all annotations
  const handleClear = () => {
    if (!fabricCanvas) return;
    
    fabricCanvas.getObjects().forEach(obj => {
      if (obj !== fabricCanvas.backgroundImage) {
        fabricCanvas.remove(obj);
      }
    });
    fabricCanvas.renderAll();
    saveState();
    toast.success('All annotations cleared');
  };

  // Save annotated image
  const handleSave = () => {
    if (!fabricCanvas) return;
    
    try {
      const annotatedImageData = fabricCanvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1,
      });
      
      onSave(annotatedImageData);
      toast.success('Annotated snapshot saved to booking');
    } catch (error) {
      console.error('Error saving annotated image:', error);
      toast.error('Failed to save annotated image');
    }
  };

  // Download image locally
  const handleDownload = () => {
    if (!fabricCanvas) return;
    
    try {
      const dataURL = fabricCanvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1,
      });
      
      const link = document.createElement('a');
      link.download = `map-snapshot-${bookingNumber || 'annotated'}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataURL;
      link.click();
      
      toast.success('Image downloaded');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download image');
    }
  };

  // Listen for path creation (when pen drawing is completed)
  useEffect(() => {
    if (!fabricCanvas) return;

    const handlePathCreated = () => {
      saveState();
    };

    fabricCanvas.on('path:created', handlePathCreated);

    return () => {
      fabricCanvas.off('path:created', handlePathCreated);
    };
  }, [fabricCanvas, history, historyStep]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] w-full">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Annotate Map Snapshot</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            {/* Drawing Tools */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeTool === 'select' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTool('select')}
              >
                Select
              </Button>
              <Button
                variant={activeTool === 'pen' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTool('pen')}
              >
                <Pen className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === 'rectangle' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleToolClick('rectangle')}
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === 'circle' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleToolClick('circle')}
              >
                <CircleIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === 'text' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleToolClick('text')}
              >
                <Type className="h-4 w-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Color Picker */}
            <div className="flex items-center gap-1">
              <Palette className="h-4 w-4 text-gray-600" />
              {DRAWING_COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded border-2 ${
                    activeColor === color ? 'border-gray-600' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setActiveColor(color)}
                />
              ))}
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Stroke Width */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Width:</span>
              <input
                type="range"
                min="1"
                max="10"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-16"
              />
              <span className="text-sm text-gray-600 w-6">{strokeWidth}</span>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* History Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={historyStep <= 0}
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={historyStep >= history.length - 1}
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1" />

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save to Booking
              </Button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg overflow-auto">
            {!isImageLoaded && !imageLoadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <span className="text-gray-600">Loading image...</span>
                </div>
              </div>
            )}
            {imageLoadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <div className="text-red-500 mb-2">⚠️</div>
                  <span className="text-gray-600">Failed to load image</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 block mx-auto"
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}
            <div className="max-w-full max-h-full">
              <canvas ref={canvasRef} className="border border-gray-300 rounded shadow-lg" />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
