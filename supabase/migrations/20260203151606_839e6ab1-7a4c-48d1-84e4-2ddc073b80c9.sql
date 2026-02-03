-- Create packing_list_items table for tracking individual product packing status
CREATE TABLE public.packing_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  booking_product_id UUID NOT NULL REFERENCES public.booking_products(id) ON DELETE CASCADE,
  quantity_to_pack INTEGER NOT NULL DEFAULT 1,
  quantity_packed INTEGER NOT NULL DEFAULT 0,
  packed_by TEXT,
  packed_at TIMESTAMPTZ,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(packing_id, booking_product_id)
);

-- Enable RLS
ALTER TABLE public.packing_list_items ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on packing_list_items"
ON public.packing_list_items
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_packing_list_items_packing_id ON public.packing_list_items(packing_id);
CREATE INDEX idx_packing_list_items_booking_product_id ON public.packing_list_items(booking_product_id);