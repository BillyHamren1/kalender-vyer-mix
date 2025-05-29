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
  Download,
  RefreshCw
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
  const [imageLoadError, setImageLoadError] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  // Improved image loading function
  const loadImageToCanvas = async (canvas: FabricCanvas, imageUrl: string) => {
    console.log('Starting image load process for URL:', imageUrl);
    setLoadingProgress('Checking image URL...');
    
    try {
      // Step 1: Test URL accessibility
      console.log('Step 1: Testing URL accessibility...');
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`URL not accessible: ${response.status} ${response.statusText}`);
      }
      console.log('✓ URL is accessible');
      
      setLoadingProgress('Loading image...');
      
      // Step 2: Load image using HTML Image element first
      console.log('Step 2: Loading with HTML Image element...');
      const htmlImg = new Image();
      
      // Set up image load promise
      const imageLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
        htmlImg.onload = () => {
          console.log('✓ HTML Image loaded successfully:', htmlImg.width, 'x', htmlImg.height);
          resolve(htmlImg);
        };
        
        htmlImg.onerror = (error) => {
          console.error('✗ HTML Image failed to load:', error);
          reject(new Error('Failed to load image with HTML Image element'));
        };
        
        // Add timeout
        setTimeout(() => {
          reject(new Error('Image loading timeout (10 seconds)'));
        }, 10000);
      });
      
      // Start loading
      htmlImg.crossOrigin = 'anonymous';
      htmlImg.src = imageUrl;
      
      // Wait for image to load
      const loadedHtmlImg = await imageLoadPromise;
      
      setLoadingProgress('Converting to Fabric.js...');
      
      // Step 3: Convert HTML Image to Fabric Image
      console.log('Step 3: Converting to Fabric.js...');
      const fabricImg = new FabricImage(loadedHtmlImg);
      
      console.log('✓ Fabric Image created successfully');
      
      // Step 4: Configure canvas dimensions
      console.log('Step 4: Setting up canvas...');
      const maxWidth = 1200;
      const maxHeight = 800;
      
      let canvasWidth = fabricImg.width || 800;
      let canvasHeight = fabricImg.height || 600;
      
      // Scale if needed
      if (canvasWidth > maxWidth || canvasHeight > maxHeight) {
        const scaleX = maxWidth / canvasWidth;
        const scaleY = maxHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);
        
        canvasWidth = canvasWidth * scale;
        canvasHeight = canvasHeight * scale;
        
        fabricImg.scaleToWidth(canvasWidth);
      }
      
      // Set canvas dimensions
      canvas.setDimensions({
        width: canvasWidth,
        height: canvasHeight
      });
      
      console.log('✓ Canvas dimensions set:', canvasWidth, 'x', canvasHeight);
      
      // Step 5: Set as background
      setLoadingProgress('Finalizing...');
      console.log('Step 5: Setting background image...');
      canvas.backgroundImage = fabricImg;
      canvas.renderAll();
      
      console.log('✓ Background image set successfully');
      setIsImageLoaded(true);
      setImageLoadError('');
      setLoadingProgress('');
      toast.success('Image loaded successfully');
      
      // Save initial state after a short delay
      setTimeout(() => {
        const initialState = JSON.stringify(canvas.toJSON());
        setHistory([initialState]);
        setHistoryStep(0);
      }, 500);
      
    } catch (error) {
      console.error('✗ Image loading failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setImageLoadError(`Failed to load image: ${errorMessage}`);
      setLoadingProgress('');
      toast.error('Failed to load captured image');
    }
  };

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current || !isOpen || !imageData) return;

    console.log('Initializing canvas with image URL:', imageData);
    setIsImageLoaded(false);
    setImageLoadError('');
    setLoadingProgress('Initializing canvas...');

    // Create fabric canvas with initial dimensions
    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
    });

    // Configure drawing brush
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = activeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    setFabricCanvas(canvas);
    
    // Load the image
    loadImageToCanvas(canvas, imageData);

    return () => {
      canvas.dispose();
      setIsImageLoaded(false);
      setImageLoadError('');
      setLoadingProgress('');
    };
  }, [isOpen, imageData]);

  // Retry loading the image
  const retryImageLoad = async () => {
    setIsRetrying(true);
    setImageLoadError('');
    setLoadingProgress('');
    
    if (fabricCanvas && imageData) {
      await loadImageToCanvas(fabricCanvas, imageData);
    }
    
    setIsRetrying(false);
  };

  // Test image URL accessibility
  const testImageUrl = async () => {
    if (!imageData) return;
    
    try {
      console.log('Testing image URL accessibility:', imageData);
      const response = await fetch(imageData, { method: 'HEAD' });
      console.log('URL test response:', response.status, response.statusText);
      
      if (response.ok) {
        toast.success('Image URL is accessible');
        // Try opening in new tab
        window.open(imageData, '_blank');
      } else {
        toast.error(`Image URL returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error testing image URL:', error);
      toast.error('Failed to access image URL');
    }
  };

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
              <Button onClick={handleSave} disabled={!isImageLoaded}>
                <Save className="h-4 w-4 mr-1" />
                Save to Booking
              </Button>
            </div>
          </div>

          {/* Canvas Container with improved loading states */}
          <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg overflow-auto relative">
            {!isImageLoaded && !imageLoadError && !isRetrying && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <span className="text-gray-600">
                    {loadingProgress || 'Loading image...'}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">URL: {imageData?.substring(0, 50)}...</p>
                </div>
              </div>
            )}
            
            {isRetrying && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <span className="text-gray-600">Retrying...</span>
                </div>
              </div>
            )}
            
            {imageLoadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center max-w-md p-4">
                  <div className="text-red-500 mb-2">⚠️</div>
                  <h3 className="font-medium text-gray-900 mb-2">Failed to Load Image</h3>
                  <p className="text-sm text-gray-600 mb-4">{imageLoadError}</p>
                  <div className="flex gap-2 justify-center">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={retryImageLoad}
                      disabled={isRetrying}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={testImageUrl}
                    >
                      Test URL
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 break-all">URL: {imageData}</p>
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
