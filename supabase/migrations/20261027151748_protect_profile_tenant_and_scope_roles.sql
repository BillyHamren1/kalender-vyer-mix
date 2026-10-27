-- Browser sessions may edit presentation fields, never the identity/tenant
-- fields used by RLS. Verified SSO and user sync write as service_role.
CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.user_id IS DISTINCT FROM OLD.user_id OR
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'Profile identity and organization are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profile_authorization_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_profile_authorization_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();

-- Admin in A must not become admin in B after a legitimate SSO org switch.
-- Keep the existing signature/default and service-side actor lookup support.
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
      AND p.organization_id = ur.organization_id
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$function$;
