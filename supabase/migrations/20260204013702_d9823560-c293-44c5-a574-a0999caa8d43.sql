-- Add cost columns to booking_products for budget calculation
ALTER TABLE booking_products
ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS material_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS setup_hours NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS external_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN booking_products.labor_cost IS 'Arbetskostnad för produkten';
COMMENT ON COLUMN booking_products.material_cost IS 'Materialkostnad för produkten';
COMMENT ON COLUMN booking_products.setup_hours IS 'Beräknade arbetstimmar för montering';
COMMENT ON COLUMN booking_products.external_cost IS 'Externa kostnader (underhyrning etc.)';
COMMENT ON COLUMN booking_products.cost_notes IS 'Noteringar om kostnader';