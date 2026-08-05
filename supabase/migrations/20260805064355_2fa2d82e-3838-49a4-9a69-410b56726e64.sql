ALTER TABLE public.booking_changes DROP CONSTRAINT IF EXISTS booking_changes_change_type_check;
ALTER TABLE public.booking_changes ADD CONSTRAINT booking_changes_change_type_check
  CHECK (change_type = ANY (ARRAY['new','update','status_change','delete','org_change','source_revision','cancellation_source']));