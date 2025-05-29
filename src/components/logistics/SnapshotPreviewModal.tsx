
import React, { useState } from 'react';
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
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface SnapshotPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageData: string; // Can be empty while loading
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

  // Download image locally
  const handleDownload = () => {
    if (!imageData) {
      toast.error('Ingen bild att ladda ner än');
      return;
    }
    
    try {
      const link = document.createElement('a');
      link.download = `map-snapshot-${bookingNumber || 'image'}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = imageData;
      link.click();
      
      toast.success('Bild nedladdad');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Misslyckades att ladda ner bilden');
    }
  };

  const handleImageError = () => {
    console.error('Failed to load snapshot image:', imageData);
    setImageLoadError(true);
    toast.error('Misslyckades att ladda bilden');
  };

  const handleImageLoad = () => {
    console.log('Snapshot image loaded successfully');
    setImageLoadError(false);
  };

  // Reset error state when modal closes
  const handleClose = () => {
    setImageLoadError(false);
    onClose();
  };

  // Always show modal when open is true
  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[90vh] w-full">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Förhandsvisning av kartbild</span>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full gap-4">
          {/* Action Bar */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              Bokning: {bookingNumber || 'Okänd'}
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={handleDownload}
                disabled={!imageData}
              >
                <Download className="h-4 w-4 mr-1" />
                Ladda ner
              </Button>
              <Button onClick={handleClose}>
                Klar
              </Button>
            </div>
          </div>

          {/* Image Display Area */}
          <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg overflow-auto">
            {!imageData ? (
              // Loading state
              <div className="flex flex-col items-center gap-3 p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="text-gray-600">Laddar kartbild...</span>
              </div>
            ) : imageLoadError ? (
              // Error state
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="text-red-500 text-lg">⚠️</div>
                <span className="text-gray-600">Misslyckades att ladda bilden</span>
                <Button variant="outline" size="sm" onClick={() => setImageLoadError(false)}>
                  Försök igen
                </Button>
              </div>
            ) : (
              // Image display
              <div className="max-w-full max-h-full p-4">
                <img 
                  src={imageData} 
                  alt="Kartbild" 
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                />
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
