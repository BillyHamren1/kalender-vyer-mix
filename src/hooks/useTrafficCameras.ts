import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TrafficCamera {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  photoUrl: string;
  photoTime: string | null;
  direction: string | null;
  type: string | null;
}

export const useTrafficCameras = () => {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchCameras = useCallback(async () => {
    if (isLoaded && cameras.length > 0) return cameras;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('trafikverket-cameras');
      if (error) throw error;
      const cams = data?.cameras || [];
      setCameras(cams);
      setIsLoaded(true);
      return cams as TrafficCamera[];
    } catch (err) {
      console.error('Error fetching traffic cameras:', err);
      toast.error('Kunde inte hämta trafikkameror');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, cameras]);

  return { cameras, isLoading, isLoaded, fetchCameras };
};
