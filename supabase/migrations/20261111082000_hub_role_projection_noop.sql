CREATE OR REPLACE FUNCTION hub_projection_private.replace_roles(
  _user_id uuid, _organization_id uuid, _roles text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE desired text[]; actual text[];
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'HUB server synchronization required' USING ERRCODE='42501';
  END IF;
  IF _user_id IS NULL OR _organization_id IS NULL OR _roles IS NULL OR
    EXISTS (SELECT 1 FROM unnest(_roles) r WHERE r IS NULL OR r NOT IN ('admin','forsaljning','projekt','lager')) THEN
    RAISE EXCEPTION 'Invalid HUB role projection' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT r ORDER BY r), ARRAY[]::text[]) INTO desired FROM unnest(_roles) r;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text || ':' || _organization_id::text, 0));
  -- Most SSO requests repeat an already-applied role set. Compare under the
  -- same actor/tenant lock before entering DELETE/INSERT and their write locks.
  SELECT coalesce(array_agg(DISTINCT role::text ORDER BY role::text), ARRAY[]::text[]) INTO actual
    FROM public.user_roles WHERE user_id=_user_id AND organization_id=_organization_id;
  IF actual IS NOT DISTINCT FROM desired THEN
    RETURN jsonb_build_object('ok',true,'roles',actual);
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND organization_id=_organization_id AND NOT(role::text=ANY(desired));
  INSERT INTO public.user_roles (user_id,organization_id,role)
    SELECT _user_id,_organization_id,r::public.app_role FROM unnest(desired) r
    ON CONFLICT (user_id,role,organization_id) DO NOTHING;
  SELECT coalesce(array_agg(DISTINCT role::text ORDER BY role::text), ARRAY[]::text[]) INTO actual
    FROM public.user_roles WHERE user_id=_user_id AND organization_id=_organization_id;
  IF actual IS DISTINCT FROM desired THEN
    RAISE EXCEPTION 'HUB role projection mismatch';
  END IF;
  RETURN jsonb_build_object('ok',true,'roles',actual);
END;
$function$;
