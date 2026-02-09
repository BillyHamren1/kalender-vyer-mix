-- Add partner response tracking to transport_assignments
ALTER TABLE public.transport_assignments
ADD COLUMN IF NOT EXISTS partner_response text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS partner_response_token uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS partner_responded_at timestamptz DEFAULT NULL;

-- Add index for token lookup
CREATE INDEX IF NOT EXISTS idx_transport_assignments_response_token 
ON public.transport_assignments (partner_response_token);

-- Add comment
COMMENT ON COLUMN public.transport_assignments.partner_response IS 'Partner response: pending, accepted, declined';
COMMENT ON COLUMN public.transport_assignments.partner_response_token IS 'Unique token for partner email response links';
COMMENT ON COLUMN public.transport_assignments.partner_responded_at IS 'When the partner responded';