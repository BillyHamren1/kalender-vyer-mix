-- Receiver first. Existing unversioned deliveries remain supported until a
-- canonical HUB subject/organization has received its first versioned state.
CREATE SCHEMA IF NOT EXISTS hub_projection_private;
REVOKE ALL ON SCHEMA hub_projection_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA hub_projection_private TO service_role;
CREATE TABLE hub_projection_private.versions (
  hub_user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  local_user_id uuid,
  source_revision bigint NOT NULL CHECK (source_revision >= 0),
  roles text[] NOT NULL,
  PRIMARY KEY (hub_user_id,organization_id)
);
ALTER TABLE hub_projection_private.versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hub_projection_private.versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON hub_projection_private.versions TO service_role;

-- Reuse the existing atomic projection body behind the versioned boundary.
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
REVOKE ALL ON FUNCTION hub_projection_private.replace_roles(uuid,uuid,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hub_projection_private.replace_roles(uuid,uuid,text[]) TO service_role;


-- Guard the old entrypoint too: an older deployed adapter or delayed request
-- must never resurrect a projection once a source revision has been recorded.
CREATE OR REPLACE FUNCTION public.replace_hub_role_projection(_user_id uuid,_organization_id uuid,_roles text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'HUB server synchronization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text || ':' || _organization_id::text,0));
  IF EXISTS(SELECT 1 FROM hub_projection_private.versions WHERE organization_id=_organization_id
    AND (hub_user_id=_user_id OR local_user_id=_user_id OR hub_user_id IN
      (SELECT l.hub_user_id FROM public.hub_identity_links l WHERE l.local_user_id=_user_id))) THEN
    RETURN jsonb_build_object('ok',false,'error','SOURCE_REVISION_REQUIRED');
  END IF;
  RETURN hub_projection_private.replace_roles(_user_id,_organization_id,_roles);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_hub_role_projection(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_hub_role_projection(uuid,uuid,text[]) TO service_role;

CREATE FUNCTION public.apply_hub_role_projection(
  _hub_user_id uuid,_organization_id uuid,_roles text[],_source_revision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  desired text[]; incoming bigint; prior hub_projection_private.versions;
  identity jsonb; local_id uuid; result jsonb;
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'HUB server synchronization required' USING ERRCODE='42501';
  END IF;
  IF _hub_user_id IS NULL OR _organization_id IS NULL OR _roles IS NULL OR EXISTS(
    SELECT 1 FROM unnest(_roles) r WHERE r IS NULL OR r NOT IN ('admin','forsaljning','projekt','lager')
  ) THEN RAISE EXCEPTION 'Invalid HUB role projection' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT r ORDER BY r),ARRAY[]::text[]) INTO desired FROM unnest(_roles) r;
  IF _source_revision IS NOT NULL THEN
    IF _source_revision !~ '^(0|[1-9][0-9]*)$' OR length(_source_revision)>19 THEN
      RAISE EXCEPTION 'Invalid source revision' USING ERRCODE='22023';
    END IF;
    BEGIN incoming:=_source_revision::bigint;
    EXCEPTION WHEN numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid source revision' USING ERRCODE='22023'; END;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_hub_user_id::text || ':' || _organization_id::text,0));
  identity:=public.resolve_hub_actor_v1(_hub_user_id);
  IF identity->>'status'='ok' THEN local_id:=(identity->>'localUserId')::uuid;
  ELSIF identity->>'status'='actor_unmapped' AND cardinality(desired)=0 THEN local_id:=NULL;
  ELSE RETURN jsonb_build_object('ok',false,'error','CANONICAL_IDENTITY_UNAVAILABLE'); END IF;
  IF local_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(local_id::text || ':' || _organization_id::text,0));
  END IF;
  SELECT * INTO prior FROM hub_projection_private.versions
    WHERE hub_user_id=_hub_user_id AND organization_id=_organization_id FOR UPDATE;
  IF FOUND THEN
    IF incoming IS NULL THEN RETURN jsonb_build_object('ok',false,'error','SOURCE_REVISION_REQUIRED'); END IF;
    IF incoming<prior.source_revision THEN RETURN jsonb_build_object('ok',false,'error','STALE_SOURCE_REVISION'); END IF;
    IF incoming=prior.source_revision AND desired IS DISTINCT FROM prior.roles THEN
      RETURN jsonb_build_object('ok',false,'error','SOURCE_REVISION_CONFLICT');
    END IF;
    IF prior.local_user_id IS NOT NULL AND prior.local_user_id IS DISTINCT FROM local_id THEN
      RETURN jsonb_build_object('ok',false,'error','CANONICAL_IDENTITY_CHANGED');
    END IF;
  END IF;
  IF local_id IS NOT NULL THEN
    result:=hub_projection_private.replace_roles(local_id,_organization_id,desired);
    IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Projection write failed'; END IF;
  END IF;
  IF incoming IS NOT NULL THEN
    INSERT INTO hub_projection_private.versions(hub_user_id,organization_id,local_user_id,source_revision,roles)
      VALUES(_hub_user_id,_organization_id,local_id,incoming,desired)
    ON CONFLICT(hub_user_id,organization_id) DO UPDATE SET
      local_user_id=excluded.local_user_id,source_revision=excluded.source_revision,roles=excluded.roles;
  END IF;
  RETURN jsonb_build_object('ok',true,'roles',desired,'local_user_id',local_id,'source_revision',_source_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_hub_role_projection(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hub_role_projection(uuid,uuid,text[],text) TO service_role;
