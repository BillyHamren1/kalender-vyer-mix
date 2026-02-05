-- Create vehicles table for fleet management
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  registration_number TEXT,
  max_weight_kg NUMERIC DEFAULT 3500,
  max_volume_m3 NUMERIC DEFAULT 15,
  vehicle_type TEXT DEFAULT 'van' CHECK (vehicle_type IN ('van', 'truck', 'trailer', 'other')),
  is_active BOOLEAN DEFAULT true,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  current_heading DOUBLE PRECISION,
  last_gps_update TIMESTAMPTZ,
  assigned_driver_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create transport_assignments table for booking-to-vehicle assignments
CREATE TABLE public.transport_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  transport_date DATE NOT NULL,
  stop_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered', 'skipped')),
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  driver_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, transport_date)
);

-- Create vehicle_gps_history table for tracking history
CREATE TABLE public.vehicle_gps_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add estimated weight and volume to booking_products
ALTER TABLE public.booking_products 
ADD COLUMN IF NOT EXISTS estimated_weight_kg NUMERIC,
ADD COLUMN IF NOT EXISTS estimated_volume_m3 NUMERIC;

-- Enable RLS on all new tables
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_gps_history ENABLE ROW LEVEL SECURITY;

-- Vehicles policies (admin/projekt/lager can manage)
CREATE POLICY "Users with planning access can view vehicles"
ON public.vehicles FOR SELECT
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can insert vehicles"
ON public.vehicles FOR INSERT
WITH CHECK (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can update vehicles"
ON public.vehicles FOR UPDATE
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can delete vehicles"
ON public.vehicles FOR DELETE
USING (public.has_planning_access(auth.uid()));

-- Transport assignments policies
CREATE POLICY "Users with planning access can view transport_assignments"
ON public.transport_assignments FOR SELECT
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can insert transport_assignments"
ON public.transport_assignments FOR INSERT
WITH CHECK (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can update transport_assignments"
ON public.transport_assignments FOR UPDATE
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can delete transport_assignments"
ON public.transport_assignments FOR DELETE
USING (public.has_planning_access(auth.uid()));

-- GPS history policies (read-only for most, write via edge function)
CREATE POLICY "Users with planning access can view gps_history"
ON public.vehicle_gps_history FOR SELECT
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Users with planning access can insert gps_history"
ON public.vehicle_gps_history FOR INSERT
WITH CHECK (public.has_planning_access(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_transport_assignments_vehicle_date ON public.transport_assignments(vehicle_id, transport_date);
CREATE INDEX idx_transport_assignments_booking ON public.transport_assignments(booking_id);
CREATE INDEX idx_vehicle_gps_history_vehicle_time ON public.vehicle_gps_history(vehicle_id, recorded_at DESC);
CREATE INDEX idx_vehicles_active ON public.vehicles(is_active) WHERE is_active = true;

-- Create trigger for updated_at on vehicles
CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();