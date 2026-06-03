import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


export interface VehicleTypeRate {
  hourly_rate?: number | null;
  daily_rate?: number | null;
  ob_rate?: number | null;
  weekend_ob_rate?: number | null;
  holiday_ob_rate?: number | null;
  km_rate?: number | null;
  notes?: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  registration_number: string | null;
  max_weight_kg: number;
  max_volume_m3: number;
  vehicle_type: 'van' | 'light_truck' | 'pickup_crane' | 'crane_15m' | 'crane_jib_20m' | 'body_truck' | 'truck' | 'trailer' | 'trailer_13m' | 'truck_trailer' | 'crane_trailer' | 'other';
  is_active: boolean;
  is_external: boolean;
  company_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  crane_capacity_ton: number | null;
  crane_reach_m: number | null;
  vehicle_length_m: number | null;
  vehicle_height_m: number | null;
  vehicle_width_m: number | null;
  hourly_rate: number | null;
  daily_rate: number | null;
  notes: string | null;
  provided_vehicle_types: string[] | null;
  vehicle_type_rates: Record<string, VehicleTypeRate> | null;
  current_lat: number | null;
  current_lng: number | null;
  current_heading: number | null;
  last_gps_update: string | null;
  assigned_driver_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleFormData {
  name: string;
  registration_number?: string;
  max_weight_kg: number;
  max_volume_m3: number;
  vehicle_type: 'van' | 'light_truck' | 'pickup_crane' | 'crane_15m' | 'crane_jib_20m' | 'body_truck' | 'truck' | 'trailer' | 'trailer_13m' | 'truck_trailer' | 'crane_trailer' | 'other';
  is_active: boolean;
  is_external: boolean;
  company_name?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  crane_capacity_ton?: number | null;
  crane_reach_m?: number | null;
  vehicle_length_m?: number | null;
  vehicle_height_m?: number | null;
  vehicle_width_m?: number | null;
  hourly_rate?: number | null;
  daily_rate?: number | null;
  notes?: string;
  provided_vehicle_types?: string[];
  vehicle_type_rates?: Record<string, VehicleTypeRate>;
}

const VEHICLES_KEY = ['vehicles', 'all'] as const;

// Module-level ref-counted realtime channel — one subscription regardless of
// how many components mount useVehicles().
let vehiclesChannel: ReturnType<typeof supabase.channel> | null = null;
let vehiclesSubscribers = 0;

function ensureVehiclesRealtime(invalidate: () => void) {
  vehiclesSubscribers += 1;
  if (!vehiclesChannel) {
    vehiclesChannel = supabase
      .channel('vehicles-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        () => invalidate()
      )
      .subscribe();
  }
  return () => {
    vehiclesSubscribers = Math.max(0, vehiclesSubscribers - 1);
    if (vehiclesSubscribers === 0 && vehiclesChannel) {
      supabase.removeChannel(vehiclesChannel);
      vehiclesChannel = null;
    }
  };
}

async function fetchVehiclesFromDb(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data as Vehicle[]) || [];
}

export const useVehicles = () => {
  const queryClient = useQueryClient();

  const { data: vehicles = [], isLoading, refetch } = useQuery({
    queryKey: VEHICLES_KEY,
    queryFn: fetchVehiclesFromDb,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  useEffect(() => {
    const off = ensureVehiclesRealtime(() => {
      queryClient.invalidateQueries({ queryKey: VEHICLES_KEY });
    });
    return off;
  }, [queryClient]);

  const setVehiclesCache = (updater: (prev: Vehicle[]) => Vehicle[]) => {
    queryClient.setQueryData<Vehicle[]>(VEHICLES_KEY, (prev) => updater(prev ?? []));
  };

  const createVehicle = async (vehicleData: VehicleFormData): Promise<Vehicle | null> => {
    try {
      const dbData = {
        ...vehicleData,
        vehicle_type_rates: vehicleData.vehicle_type_rates
          ? JSON.parse(JSON.stringify(vehicleData.vehicle_type_rates))
          : {},
      };
      const { data, error } = await supabase
        .from('vehicles')
        .insert(dbData)
        .select()
        .single();
      if (error) throw error;
      setVehiclesCache((prev) => [...prev, data as Vehicle]);
      toast.success('Fordon skapat');
      return data as Vehicle;
    } catch (error: any) {
      console.error('Error creating vehicle:', error);
      toast.error('Kunde inte skapa fordon');
      return null;
    }
  };

  const updateVehicle = async (id: string, vehicleData: Partial<VehicleFormData>): Promise<boolean> => {
    try {
      const dbData = {
        ...vehicleData,
        ...(vehicleData.vehicle_type_rates !== undefined && {
          vehicle_type_rates: JSON.parse(JSON.stringify(vehicleData.vehicle_type_rates)),
        }),
      };
      const { error } = await supabase
        .from('vehicles')
        .update(dbData)
        .eq('id', id);
      if (error) throw error;
      setVehiclesCache((prev) => prev.map((v) => (v.id === id ? { ...v, ...vehicleData } : v)));
      toast.success('Fordon uppdaterat');
      return true;
    } catch (error: any) {
      console.error('Error updating vehicle:', error);
      toast.error('Kunde inte uppdatera fordon');
      return false;
    }
  };

  const deleteVehicle = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      setVehiclesCache((prev) => prev.filter((v) => v.id !== id));
      toast.success('Fordon borttaget');
      return true;
    } catch (error: any) {
      console.error('Error deleting vehicle:', error);
      toast.error('Kunde inte ta bort fordon');
      return false;
    }
  };

  return {
    vehicles,
    activeVehicles: vehicles.filter((v) => v.is_active),
    isLoading,
    fetchVehicles: refetch,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  };
};

