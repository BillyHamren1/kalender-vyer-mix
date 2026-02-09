import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface TransportAssignment {
  id: string;
  vehicle_id: string;
  booking_id: string;
  transport_date: string;
  stop_order: number;
  status: 'pending' | 'in_transit' | 'delivered' | 'skipped';
  partner_response: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  driver_notes: string | null;
  pickup_address: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  created_at: string;
  // Joined data
  booking?: {
    id: string;
    client: string;
    deliveryaddress: string;
    delivery_city: string;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    booking_products?: Array<{
      name: string;
      quantity: number;
      estimated_weight_kg: number | null;
      estimated_volume_m3: number | null;
    }>;
  };
}

export interface AssignmentFormData {
  vehicle_id: string;
  booking_id: string;
  transport_date: string;
  transport_time?: string;
  pickup_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  stop_order?: number;
  driver_notes?: string;
  estimated_duration?: number;
}

export const useTransportAssignments = (date?: Date | null, endDate?: Date | null) => {
  const [assignments, setAssignments] = useState<TransportAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssignments = useCallback(async (filterDate?: Date, filterEndDate?: Date) => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('transport_assignments')
        .select(`
          *,
          booking:bookings!booking_id (
            id,
            client,
            deliveryaddress,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            booking_products (
              name,
              quantity,
              estimated_weight_kg,
              estimated_volume_m3
            )
          )
        `)
        .order('stop_order', { ascending: true });

      if (filterDate && filterEndDate) {
        query = query
          .gte('transport_date', format(filterDate, 'yyyy-MM-dd'))
          .lte('transport_date', format(filterEndDate, 'yyyy-MM-dd'));
      } else if (filterDate) {
        query = query.eq('transport_date', format(filterDate, 'yyyy-MM-dd'));
      }

      const { data, error } = await query;

      if (error) throw error;
      // Cast to TransportAssignment[] since DB returns string for enums
      setAssignments((data as unknown as TransportAssignment[]) || []);
    } catch (error: any) {
      console.error('Error fetching transport assignments:', error);
      toast.error('Kunde inte hämta transporttilldelningar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const assignBookingToVehicle = async (data: AssignmentFormData): Promise<TransportAssignment | null> => {
    try {
      const { data: assignment, error } = await supabase
        .from('transport_assignments')
        .insert({
          ...data,
          stop_order: data.stop_order || 0
        })
        .select(`
          *,
          booking:bookings!booking_id (
            id,
            client,
            deliveryaddress,
            delivery_city,
            delivery_latitude,
            delivery_longitude
          )
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Bokningen är redan tilldelad denna dag');
          return null;
        }
        throw error;
      }
      
      setAssignments(prev => [...prev, assignment as unknown as TransportAssignment]);
      toast.success('Bokning tilldelad till fordon');
      return assignment as unknown as TransportAssignment;
    } catch (error: any) {
      console.error('Error assigning booking:', error);
      toast.error('Kunde inte tilldela bokning');
      return null;
    }
  };

  const updateAssignment = async (id: string, updates: Partial<TransportAssignment>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('transport_assignments')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setAssignments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
      return true;
    } catch (error: any) {
      console.error('Error updating assignment:', error);
      toast.error('Kunde inte uppdatera tilldelning');
      return false;
    }
  };

  const removeAssignment = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('transport_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setAssignments(prev => prev.filter(a => a.id !== id));
      toast.success('Tilldelning borttagen');
      return true;
    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast.error('Kunde inte ta bort tilldelning');
      return false;
    }
  };

  const optimizeRoute = async (vehicleId: string, transportDate: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('optimize-logistics-route', {
        body: { vehicle_id: vehicleId, transport_date: transportDate }
      });

      if (error) throw error;
      
      if (data.success) {
        toast.success(`Rutt optimerad: ${data.total_distance_km} km, ~${data.total_duration_min} min`);
        // Refresh assignments to get updated order
        await fetchAssignments(new Date(transportDate));
        return true;
      } else {
        throw new Error(data.error || 'Optimization failed');
      }
    } catch (error: any) {
      console.error('Error optimizing route:', error);
      toast.error('Kunde inte optimera rutt');
      return false;
    }
  };

  // Get assignments grouped by vehicle
  const getAssignmentsByVehicle = useCallback((vehicleId: string) => {
    return assignments
      .filter(a => a.vehicle_id === vehicleId)
      .sort((a, b) => a.stop_order - b.stop_order);
  }, [assignments]);

  // Calculate total weight/volume for a vehicle
  const getVehicleLoad = useCallback((vehicleId: string) => {
    const vehicleAssignments = getAssignmentsByVehicle(vehicleId);
    
    let totalWeight = 0;
    let totalVolume = 0;

    vehicleAssignments.forEach(assignment => {
      const products = assignment.booking?.booking_products || [];
      products.forEach(product => {
        totalWeight += (product.estimated_weight_kg || 0) * product.quantity;
        totalVolume += (product.estimated_volume_m3 || 0) * product.quantity;
      });
    });

    return { totalWeight, totalVolume };
  }, [getAssignmentsByVehicle]);

  // Stabilize date dependencies to avoid infinite re-render loops
  const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
  const endDateStr = endDate ? format(endDate, 'yyyy-MM-dd') : '';

  useEffect(() => {
    const startDate = dateStr ? new Date(dateStr + 'T00:00:00') : undefined;
    const end = endDateStr ? new Date(endDateStr + 'T00:00:00') : undefined;
    fetchAssignments(startDate, end);

    // Real-time subscription
    const channel = supabase
      .channel('transport-assignments-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transport_assignments'
      }, () => {
        // Refresh on any change
        fetchAssignments(startDate, end);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateStr, endDateStr, fetchAssignments]);

  return {
    assignments,
    isLoading,
    fetchAssignments,
    assignBookingToVehicle,
    updateAssignment,
    removeAssignment,
    optimizeRoute,
    getAssignmentsByVehicle,
    getVehicleLoad
  };
};
