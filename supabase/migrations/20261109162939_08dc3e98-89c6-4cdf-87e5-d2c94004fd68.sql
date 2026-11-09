CREATE OR REPLACE FUNCTION public.trg_enqueue_additions_on_root_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v jsonb := to_jsonb(NEW);
BEGIN
  IF v->>'booking_id' IS NULL OR v->>'organization_id' IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'projects'
     AND (v->>'deleted_at' IS NOT NULL OR v->>'status' = 'cancelled') THEN
    RETURN NEW;
  END IF;
  PERFORM public.enqueue_pending_booking_additions((v->>'organization_id')::uuid, v->>'booking_id');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_enqueue_additions_on_root_assignment() FROM PUBLIC, anon, authenticated;