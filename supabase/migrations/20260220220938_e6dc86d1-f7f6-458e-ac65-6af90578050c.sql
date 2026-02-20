
-- Update set_organization_id trigger to handle service_role (auth.uid() = null)
-- Falls back to first organization when no authenticated user
CREATE OR REPLACE FUNCTION public.set_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_organization_id(auth.uid());
  END IF;
  -- Fallback: if still null (e.g. service_role with no auth.uid), use first org
  IF NEW.organization_id IS NULL THEN
    SELECT id INTO NEW.organization_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
