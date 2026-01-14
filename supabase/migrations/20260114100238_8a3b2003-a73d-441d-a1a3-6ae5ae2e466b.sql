-- Create warehouse calendar events table
CREATE TABLE public.warehouse_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  booking_number TEXT,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  resource_id TEXT NOT NULL DEFAULT 'warehouse',
  event_type TEXT NOT NULL CHECK (event_type IN ('packing', 'delivery', 'event', 'return', 'inventory', 'unpacking')),
  delivery_address TEXT,
  
  -- Change tracking - stores original dates from staff planning
  source_rig_date DATE,
  source_event_date DATE,
  source_rigdown_date DATE,
  has_source_changes BOOLEAN DEFAULT false,
  change_details TEXT,
  manually_adjusted BOOLEAN DEFAULT false,
  viewed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouse_calendar_events ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for all operations
CREATE POLICY "Allow all operations on warehouse_calendar_events" 
ON public.warehouse_calendar_events 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_warehouse_events_booking_id ON public.warehouse_calendar_events(booking_id);
CREATE INDEX idx_warehouse_events_start_time ON public.warehouse_calendar_events(start_time);
CREATE INDEX idx_warehouse_events_event_type ON public.warehouse_calendar_events(event_type);
CREATE INDEX idx_warehouse_events_has_changes ON public.warehouse_calendar_events(has_source_changes) WHERE has_source_changes = true;

-- Trigger for updated_at
CREATE TRIGGER update_warehouse_calendar_events_updated_at
BEFORE UPDATE ON public.warehouse_calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();