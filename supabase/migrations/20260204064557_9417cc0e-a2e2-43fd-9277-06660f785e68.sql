-- Create table to store completed job analytics for AI learning
CREATE TABLE public.job_completion_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT NOT NULL, -- TEXT to match bookings.id type
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Job identifiers
  booking_number TEXT,
  client_name TEXT NOT NULL,
  
  -- Dates
  rig_date DATE,
  event_date DATE,
  rigdown_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Logistics context
  delivery_address TEXT,
  delivery_city TEXT,
  carry_more_than_10m BOOLEAN DEFAULT false,
  ground_nails_allowed BOOLEAN DEFAULT true,
  exact_time_required BOOLEAN DEFAULT false,
  
  -- Product summary (denormalized for AI access)
  product_categories JSONB DEFAULT '[]', -- [{name, quantity, setup_hours, total_price}]
  total_products INTEGER DEFAULT 0,
  total_product_value NUMERIC DEFAULT 0,
  total_setup_hours_estimated NUMERIC DEFAULT 0,
  
  -- Staff performance
  staff_assignments JSONB DEFAULT '[]', -- [{staff_id, staff_name, role, dates, hours_worked, performance_notes}]
  total_staff_count INTEGER DEFAULT 0,
  total_hours_worked NUMERIC DEFAULT 0,
  total_overtime_hours NUMERIC DEFAULT 0,
  
  -- Financial summary
  total_labor_cost NUMERIC DEFAULT 0,
  total_material_cost NUMERIC DEFAULT 0,
  total_external_cost NUMERIC DEFAULT 0,
  total_purchases NUMERIC DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  total_margin NUMERIC DEFAULT 0,
  margin_percentage NUMERIC DEFAULT 0,
  
  -- Warehouse costs (schablonbelopp)
  warehouse_handling_cost NUMERIC DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_job_completion_analytics_completed_at ON public.job_completion_analytics(completed_at DESC);
CREATE INDEX idx_job_completion_analytics_client ON public.job_completion_analytics(client_name);
CREATE INDEX idx_job_completion_analytics_booking_id ON public.job_completion_analytics(booking_id);

-- Enable RLS
ALTER TABLE public.job_completion_analytics ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth in this app)
CREATE POLICY "Allow all access to job_completion_analytics"
  ON public.job_completion_analytics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create table for staff-job type affinity (learned patterns)
CREATE TABLE public.staff_job_affinity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL, -- TEXT to match staff_members.id type
  staff_name TEXT NOT NULL,
  
  -- Job type categories (product-based)
  product_category TEXT NOT NULL,
  
  -- Performance metrics
  jobs_completed INTEGER DEFAULT 0,
  total_hours_on_category NUMERIC DEFAULT 0,
  avg_efficiency_score NUMERIC DEFAULT 0,
  
  -- Derived scores
  affinity_score NUMERIC DEFAULT 0,
  last_job_date DATE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint per staff+category
  UNIQUE(staff_id, product_category)
);

-- Create index
CREATE INDEX idx_staff_job_affinity_staff ON public.staff_job_affinity(staff_id);
CREATE INDEX idx_staff_job_affinity_category ON public.staff_job_affinity(product_category);
CREATE INDEX idx_staff_job_affinity_score ON public.staff_job_affinity(affinity_score DESC);

-- Enable RLS
ALTER TABLE public.staff_job_affinity ENABLE ROW LEVEL SECURITY;

-- Allow all operations
CREATE POLICY "Allow all access to staff_job_affinity"
  ON public.staff_job_affinity
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger to update updated_at
CREATE TRIGGER update_job_completion_analytics_updated_at
  BEFORE UPDATE ON public.job_completion_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_job_affinity_updated_at
  BEFORE UPDATE ON public.staff_job_affinity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();