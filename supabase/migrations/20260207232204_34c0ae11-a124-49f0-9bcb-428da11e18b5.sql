-- Add missing columns to booking_products for package component support
ALTER TABLE public.booking_products 
  ADD COLUMN IF NOT EXISTS sort_index REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_item_type_id TEXT,
  ADD COLUMN IF NOT EXISTS inventory_package_id TEXT,
  ADD COLUMN IF NOT EXISTS assembly_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_components JSONB,
  ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 25;