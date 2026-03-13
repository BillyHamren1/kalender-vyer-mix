-- Step 1: Drop default that depends on enum
ALTER TABLE public.project_billing ALTER COLUMN billing_status DROP DEFAULT;

-- Step 2: Change column to text
ALTER TABLE public.project_billing ALTER COLUMN billing_status TYPE text USING billing_status::text;

-- Step 3: Map old values to new
UPDATE public.project_billing SET billing_status = 'draft' WHERE billing_status IN ('not_ready', 'under_review');
UPDATE public.project_billing SET billing_status = 'ready' WHERE billing_status IN ('ready_to_invoice', 'invoice_created');
UPDATE public.project_billing SET billing_status = 'invoiced' WHERE billing_status IN ('invoiced', 'partially_paid', 'paid', 'overdue');

-- Step 4: Drop old enum
DROP TYPE public.billing_status;

-- Step 5: Create new enum
CREATE TYPE public.billing_status AS ENUM ('draft', 'ready', 'invoiced');

-- Step 6: Alter column back to enum
ALTER TABLE public.project_billing ALTER COLUMN billing_status TYPE public.billing_status USING billing_status::public.billing_status;

-- Step 7: Set new default
ALTER TABLE public.project_billing ALTER COLUMN billing_status SET DEFAULT 'draft'::public.billing_status;