
DO $$
DECLARE
  v_project_id uuid := 'c619c294-d2a1-49ad-9220-e34dc673321f';
  v_booking_id text := '492f4f8d-c39e-4069-a275-997ca43a8783';
  v_org_id uuid := 'f5e5cade-f08b-4833-a105-56461f15b191';
BEGIN
  UPDATE public.projects
  SET deleted_at = now(),
      status = 'cancelled'
  WHERE id = v_project_id
    AND deleted_at IS NULL;

  UPDATE public.bookings
  SET assigned_to_project = false,
      assigned_project_id = NULL,
      assigned_project_name = NULL,
      rental_only = true
  WHERE id = v_booking_id;

  INSERT INTO public.project_audit_log (project_id, organization_id, project_type, action, details)
  VALUES (
    v_project_id,
    v_org_id,
    'medium',
    'soft_delete',
    jsonb_build_object(
      'reason', 'rental_only booking should not have project',
      'booking_number', '2605-76',
      'auto_cleanup', true
    )
  );
END $$;
