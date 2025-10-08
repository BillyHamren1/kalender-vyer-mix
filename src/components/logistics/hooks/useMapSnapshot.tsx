
import { useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Booking } from '@/types/booking';

export const useMapSnapshot = (
  map: React.MutableRefObject<mapboxgl.Map | null>,
  selectedBooking: Booking | null,
  onSnapshotSaved?: (attachment: any) => void
) => {
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);

  const validateCanvasContent = (canvas: HTMLCanvasElement): boolean => {
    console.log('🔍 Validating canvas content...');
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      const width = canvas.width;
      const height = canvas.height;
      const sampleSize = 20;
      const samplePoints: [number, number][] = [];
      
      for (let i = 0; i < sampleSize; i++) {
        const x = (width / sampleSize) * i + (width / (sampleSize * 2));
        const y = (height / sampleSize) * i + (height / (sampleSize * 2));
        samplePoints.push([x, y]);
      }

      let nonTransparentPixels = 0;
      let colorVariation = 0;
      const colors: number[][] = [];

      for (const [x, y] of samplePoints) {
        const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);
        const [r, g, b, a] = imageData.data;
        
        if (a > 0) {
          nonTransparentPixels++;
          colors.push([r, g, b]);
        }
      }

      if (colors.length > 1) {
        for (let i = 1; i < colors.length; i++) {
          const [r1, g1, b1] = colors[i - 1];
          const [r2, g2, b2] = colors[i];
          const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
          colorVariation += diff;
        }
        colorVariation = colorVariation / colors.length;
      }

      const transparencyRatio = nonTransparentPixels / samplePoints.length;
      
      return (
        nonTransparentPixels >= 5 ||
        transparencyRatio > 0.1 ||
        colorVariation > 10
      );
    } catch (error) {
      console.error('❌ Error validating canvas content:', error);
      return true;
    }
  };

  const waitForMapReady = async (): Promise<boolean> => {
    if (!map.current) return false;

    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;
      const checkInterval = 500;

      const checkMapReady = () => {
        attempts++;
        
        if (!map.current) {
          resolve(false);
          return;
        }

        const isStyleLoaded = map.current.isStyleLoaded();
        const isMapIdle = map.current.loaded();
        const canvas = map.current.getCanvas();
        const canvasValid = canvas && canvas.width > 0 && canvas.height > 0;

        if (isStyleLoaded && isMapIdle && canvasValid) {
          resolve(true);
          return;
        }

        if (attempts >= maxAttempts) {
          resolve(false);
          return;
        }

        setTimeout(checkMapReady, checkInterval);
      };

      checkMapReady();
    });
  };

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      console.log('📸 Starting map snapshot capture...');
      
      toast.info('Capturing map snapshot...');
      
      const isMapReady = await waitForMapReady();
      
      if (!isMapReady) {
        toast.info('Map may still be loading, but capturing anyway...');
      }

      for (let i = 0; i < 3; i++) {
        map.current.resize();
        map.current.triggerRepaint();
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      const canvas = map.current.getCanvas();
      const hasValidContent = validateCanvasContent(canvas);
      
      if (!hasValidContent) {
        toast.info('Canvas appears empty but attempting capture...');
      }

      let dataURL = '';
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        
        try {
          map.current.triggerRepaint();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          dataURL = canvas.toDataURL('image/png', 1.0);
          
          if (dataURL && dataURL.length > 100) {
            break;
          } else {
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (error) {
          console.error(`❌ Canvas capture error on attempt ${attempts}:`, error);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!dataURL || dataURL.length < 50) {
        toast.error('Failed to capture map image');
        return;
      }

      toast.info('Saving map snapshot...');
      
      const { data, error } = await supabase.functions.invoke('save-map-snapshot', {
        body: {
          image: dataURL,
          bookingId: selectedBooking.id,
          bookingNumber: selectedBooking.bookingNumber
        }
      });

      if (error) {
        toast.error('Failed to save map snapshot');
        return;
      }

      toast.success('Map snapshot saved successfully!');
      
      if (onSnapshotSaved && data.attachment) {
        onSnapshotSaved(data.attachment);
      }

    } catch (error) {
      console.error('Error taking snapshot:', error);
      toast.error('Failed to capture map snapshot');
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  return {
    isCapturingSnapshot,
    takeMapSnapshot
  };
};
