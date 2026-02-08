import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Vehicle {
  id: string;
  name: string;
  registration_number: string | null;
  max_weight_kg: number;
  max_volume_m3: number;
  vehicle_type: 'van' | 'truck' | 'trailer' | 'other';
  is_active: boolean;
  is_external: boolean;
  company_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  vehicle_type: 'van' | 'truck' | 'trailer' | 'other';
  is_active: boolean;
  is_external: boolean;
  company_name?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
}

export const useVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVehicles = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('name');

      if (error) throw error;
      // Cast to Vehicle[] since DB returns string for enums
      setVehicles((data as Vehicle[]) || []);
    } catch (error: any) {
      console.error('Error fetching vehicles:', error);
      toast.error('Kunde inte hämta fordon');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createVehicle = async (vehicleData: VehicleFormData): Promise<Vehicle | null> => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .insert(vehicleData)
        .select()
        .single();

      if (error) throw error;
      setVehicles(prev => [...prev, data as Vehicle]);
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
      const { error } = await supabase
        .from('vehicles')
        .update(vehicleData)
        .eq('id', id);

      if (error) throw error;
      
      setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...vehicleData } : v));
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
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setVehicles(prev => prev.filter(v => v.id !== id));
      toast.success('Fordon borttaget');
      return true;
    } catch (error: any) {
      console.error('Error deleting vehicle:', error);
      toast.error('Kunde inte ta bort fordon');
      return false;
    }
  };

  // Real-time subscription for GPS updates
  useEffect(() => {
    fetchVehicles();

    const channel = supabase
      .channel('vehicles-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles'
      }, (payload) => {
        setVehicles(prev => prev.map(v => 
          v.id === payload.new.id ? { ...v, ...payload.new } : v
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVehicles]);

  return {
    vehicles,
    activeVehicles: vehicles.filter(v => v.is_active),
    isLoading,
    fetchVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle
  };
};
