-- Extend billing_status enum with new values
ALTER TYPE public.billing_status ADD VALUE IF NOT EXISTS 'needs_completion';
ALTER TYPE public.billing_status ADD VALUE IF NOT EXISTS 'ready_for_handover';
ALTER TYPE public.billing_status ADD VALUE IF NOT EXISTS 'handed_over_to_booking';
ALTER TYPE public.billing_status ADD VALUE IF NOT EXISTS 'invoiced_in_booking';