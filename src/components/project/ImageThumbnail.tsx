import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ImageThumbnailProps {
  url: string;
  name?: string | null;
}

export const ImageThumbnail = ({ url, name }: ImageThumbnailProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border/40 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
        title={name || 'Visa bild'}
      >
        <img
          src={url}
          alt={name || 'Bild'}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2">
          <img
            src={url}
            alt={name || 'Bild'}
            className="w-full h-auto rounded-lg"
          />
          {name && (
            <p className="text-xs text-muted-foreground text-center mt-1">{name}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
