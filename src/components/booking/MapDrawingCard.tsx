import React, { useState } from 'react';
import { Map } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MapDrawingCardProps {
  mapDrawingUrl?: string;
}

export const MapDrawingCard: React.FC<MapDrawingCardProps> = ({ mapDrawingUrl }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Map className="h-4 w-4" />
            <span>Placeringsritning</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-3">
          {mapDrawingUrl ? (
            <img
              src={mapDrawingUrl}
              alt="Placeringsritning"
              className="w-full rounded-md cursor-pointer hover:opacity-90 transition-opacity border"
              onClick={() => setLightboxOpen(true)}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Ingen placeringsritning tillgänglig
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-4 bg-card">
          {mapDrawingUrl && (
            <img
              src={mapDrawingUrl}
              alt="Placeringsritning"
              className="w-full h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
