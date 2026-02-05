import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Vehicle } from './useVehicles';

export interface VehiclePosition {
  id: string;
  name: string;
  lat: number;
  lng: number;
  heading: number | null;
  lastUpdate: Date;
  isOnline: boolean; // Updated within last 5 minutes
}

export const useVehicleTracking = () => {
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, name, current_lat, current_lng, current_heading, last_gps_update')
        .eq('is_active', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null);

      if (error) throw error;

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const vehiclePositions: VehiclePosition[] = (data || []).map(v => ({
        id: v.id,
        name: v.name,
        lat: v.current_lat!,
        lng: v.current_lng!,
        heading: v.current_heading,
        lastUpdate: new Date(v.last_gps_update || 0),
        isOnline: v.last_gps_update ? new Date(v.last_gps_update) > fiveMinutesAgo : false
      }));

      setPositions(vehiclePositions);
    } catch (error) {
      console.error('Error fetching vehicle positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();

    // Real-time subscription for position updates
    const channel = supabase
      .channel('vehicle-tracking')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles',
        filter: 'is_active=eq.true'
      }, (payload) => {
        const { id, name, current_lat, current_lng, current_heading, last_gps_update } = payload.new as Vehicle;
        
        if (current_lat && current_lng) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          
          setPositions(prev => {
            const existing = prev.findIndex(p => p.id === id);
            const newPosition: VehiclePosition = {
              id,
              name,
              lat: current_lat,
              lng: current_lng,
              heading: current_heading,
              lastUpdate: new Date(last_gps_update || 0),
              isOnline: last_gps_update ? new Date(last_gps_update) > fiveMinutesAgo : false
            };

            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = newPosition;
              return updated;
            } else {
              return [...prev, newPosition];
            }
          });
        }
      })
      .subscribe();

    // Refresh online status every minute
    const interval = setInterval(() => {
      setPositions(prev => prev.map(p => ({
        ...p,
        isOnline: p.lastUpdate > new Date(Date.now() - 5 * 60 * 1000)
      })));
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchPositions]);

  return {
    positions,
    isLoading,
    refreshPositions: fetchPositions
  };
};
