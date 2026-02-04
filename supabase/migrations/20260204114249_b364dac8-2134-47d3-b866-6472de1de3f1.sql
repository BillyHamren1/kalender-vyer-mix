-- Create packing_parcels table for grouping items into physical packages
CREATE TABLE public.packing_parcels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  parcel_number INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate parcel numbers per packing
ALTER TABLE public.packing_parcels 
ADD CONSTRAINT unique_parcel_number_per_packing UNIQUE (packing_id, parcel_number);

-- Enable RLS
ALTER TABLE public.packing_parcels ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on packing_parcels" 
ON public.packing_parcels 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add parcel_id column to packing_list_items
ALTER TABLE public.packing_list_items 
ADD COLUMN parcel_id UUID REFERENCES public.packing_parcels(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_packing_list_items_parcel_id ON public.packing_list_items(parcel_id);
CREATE INDEX idx_packing_parcels_packing_id ON public.packing_parcels(packing_id);