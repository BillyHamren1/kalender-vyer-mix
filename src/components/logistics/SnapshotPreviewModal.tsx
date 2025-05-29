
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import { 
  X,
  Download,
  Loader2,
  RefreshCw,
  Edit3,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { SnapshotDrawingCanvas } from './SnapshotDrawingCanvas';

interface SnapshotPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageData: string;
  onSave: (annotatedImageData: string) => void;
  bookingNumber?: string;
}

export const SnapshotPreviewModal: React.FC<SnapshotPreviewModalProps> = ({
  isOpen,
  onClose,
  imageData,
  onSave,
  bookingNumber
}) => {
  const [imageLoadError, setImageLoadError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  // Reset error state when modal opens or imageData changes
  useEffect(() => {
    if (isOpen && imageData) {
      console.log('📸 SnapshotPreviewModal: Image data received:', imageData.substring(0, 50) + '...');
      setImageLoadError(false);
      setIsDrawingMode(false);
    }
  }, [isOpen, imageData]);

  // Download image locally
  const handleDownload = () => {
    if (!imageData) {
      toast.error('Ingen bild att ladda ner än');
      return;
    }
    
    console.log('💾 Starting image download...');
    
    try {
      const link = document.createElement('a');
      link.download = `map-snapshot-${bookingNumber || 'image'}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = imageData;
      link.click();
      
      console.log('✅ Image download successful');
      toast.success('Bild nedladdad');
    } catch (error) {
      console.error('❌ Error downloading image:', error);
      toast.error('Misslyckades att ladda ner bilden');
    }
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('❌ Failed to load snapshot image:');
    console.error('  - Image src:', imageData?.substring(0, 100) + '...');
    console.error('  - Error event:', event);
    
    setImageLoadError(true);
    toast.error('Misslyckades att ladda bilden');
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.log('✅ Snapshot image loaded successfully');
    console.log('  - Image dimensions:', {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight
    });
    setImageLoadError(false);
  };

  const handleRetry = () => {
    console.log('🔄 Retrying image load...');
    setIsRetrying(true);
    setImageLoadError(false);
    
    setTimeout(() => {
      setIsRetrying(false);
    }, 1000);
  };

  const handleSaveFromDrawing = (annotatedImageData: string) => {
    console.log('💾 Saving annotated image...');
    onSave(annotatedImageData);
  };

  const handleSaveOriginal = () => {
    console.log('💾 Saving original image...');
    onSave(imageData);
  };

  const handleClose = () => {
    console.log('🚪 Closing snapshot modal');
    setImageLoadError(false);
    setIsRetrying(false);
    setIsDrawingMode(false);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[95vh] w-full p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center justify-between">
            <span>Förhandsvisning av kartbild</span>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full">
          {!isDrawingMode && (
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
              <div className="text-sm text-gray-600">
                Bokning: {bookingNumber || 'Okänd'}
              </div>
              
              <div className="flex items-center gap-2">
                {imageLoadError && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleRetry}
                    disabled={isRetrying}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                    Försök igen
                  </Button>
                )}
                
                <Button 
                  variant="outline" 
                  onClick={handleDownload}
                  disabled={!imageData || imageLoadError}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Ladda ner
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => setIsDrawingMode(true)}
                  disabled={!imageData || imageLoadError}
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  Redigera
                </Button>

                <Button 
                  onClick={handleSaveOriginal}
                  disabled={!imageData || imageLoadError}
                >
                  Spara original
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {!imageData ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="text-gray-600">Laddar kartbild...</span>
                <span className="text-xs text-gray-400">
                  Väntar på bildinformation från servern
                </span>
              </div>
            ) : isDrawingMode ? (
              <SnapshotDrawingCanvas
                imageData={imageData}
                onSave={handleSaveFromDrawing}
                onClose={() => setIsDrawingMode(false)}
              />
            ) : imageLoadError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                <div className="text-red-500 text-lg">⚠️</div>
                <span className="text-gray-600">Misslyckades att ladda bilden</span>
                <span className="text-xs text-gray-400">
                  Bilddata: {imageData.length} tecken
                </span>
                <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                  Försök igen
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-100 p-4">
                <div className="max-w-full max-h-full">
                  <img 
                    src={isRetrying ? `${imageData}?t=${Date.now()}` : imageData}
                    alt="Kartbild" 
                    className="max-w-full max-h-full object-contain rounded shadow-lg"
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    style={{ 
                      border: imageLoadError ? '2px solid red' : 'none'
                    }}
                  />
                  <div className="mt-2 text-xs text-gray-400 text-center">
                    Bildstorlek: {Math.round(imageData.length / 1024)} KB
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
