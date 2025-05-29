
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
  imageData: string;
  onSave: (annotatedImageData: string) => void;
  bookingNumber?: string;
  isLoading?: boolean;
}

export const SnapshotPreviewModal: React.FC<SnapshotPreviewModalProps> = ({
  isOpen,
  onClose,
  imageData,
  onSave,
  bookingNumber,
  isLoading = false
}) => {
  const [imageLoadError, setImageLoadError] = useState(false);

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

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] w-full">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Karta – Snapshot Preview</span>
            <div className="flex gap-2">
              {imageData && !isLoading && (
                <Button variant="ghost" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" /> Ladda ner
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="w-full h-full flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
              <span className="text-muted-foreground">Capturing snapshot...</span>
            </div>
          ) : imageData ? (
            <img
              src={imageData}
              onError={() => {
                toast.error("Kunde inte ladda kartbilden");
                setImageLoadError(true);
              }}
              className="max-w-full max-h-full object-contain rounded border"
              alt="Map Snapshot"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin w-6 h-6 text-gray-400" />
              <span className="text-muted-foreground">Waiting for image...</span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
