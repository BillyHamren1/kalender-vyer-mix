
import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import { 
  X,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface SnapshotPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageData: string; // Now expects a complete image URL
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
  // Don't render if no image URL is provided
  if (!imageData) {
    return null;
  }

  // Download image locally
  const handleDownload = () => {
    try {
      const link = document.createElement('a');
      link.download = `map-snapshot-${bookingNumber || 'image'}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = imageData;
      link.click();
      
      toast.success('Image downloaded');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download image');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] w-full">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Map Snapshot Preview</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full gap-4">
          {/* Action Bar */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              Booking: {bookingNumber || 'Unknown'}
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button onClick={onClose}>
                Done
              </Button>
            </div>
          </div>

          {/* Image Display */}
          <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg overflow-auto">
            <div className="max-w-full max-h-full p-4">
              <img 
                src={imageData} 
                alt="Map Snapshot" 
                className="max-w-full max-h-full object-contain rounded shadow-lg"
                onError={(e) => {
                  console.error('Failed to load snapshot image:', imageData);
                  toast.error('Failed to load snapshot image');
                }}
                onLoad={() => {
                  console.log('Snapshot image loaded successfully');
                }}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
