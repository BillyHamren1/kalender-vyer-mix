-- Migrate existing billing_status data to new values
UPDATE public.project_billing SET billing_status = 'ready_for_handover' WHERE billing_status = 'ready';
UPDATE public.project_billing SET billing_status = 'invoiced_in_booking' WHERE billing_status = 'invoiced';