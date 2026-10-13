-- HUB identity links: server-controlled, immutable mapping HUB subject -> local auth user.
-- Never derived from user_metadata. Authorization uses per-org user_roles, not profiles.organization_id.
CREATE TABLE public.hub_identity_links (
  hub_user_id uuid PRIMARY KEY,
  local_user_id uuid NOT NULL UNIQUE,
  link_source text NOT NULL CHECK (link_source IN ('explicit_admin_mapping','verified_sso_adoption')),
  authorized_reason text NOT NULL CHECK (length(authorized_reason) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hub_user_id <> local_user_id)
);
REVOKE ALL ON public.hub_identity_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hub_identity_links TO service_role;
ALTER TABLE public.hub_identity_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hub_identity_links_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'hub_identity_links_immutable' USING ERRCODE='42501'; END; $$;
CREATE TRIGGER hub_identity_links_no_update_delete BEFORE UPDATE OR DELETE ON public.hub_identity_links
  FOR EACH ROW EXECUTE FUNCTION public.hub_identity_links_immutable();

-- Resolve a trusted HUB subject to exactly one local principal, fail closed.
CREATE OR REPLACE FUNCTION public.resolve_hub_actor_v1(_hub_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_link uuid; v_direct boolean; v_reverse boolean;
BEGIN
  IF _hub_user_id IS NULL THEN RETURN jsonb_build_object('status','actor_unmapped'); END IF;
  SELECT local_user_id INTO v_link FROM public.hub_identity_links WHERE hub_user_id=_hub_user_id;
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=_hub_user_id) INTO v_direct;
  SELECT EXISTS(SELECT 1 FROM public.hub_identity_links WHERE local_user_id=_hub_user_id) INTO v_reverse;
  -- Subject is a local account already adopted by another HUB identity: never usable as a HUB subject.
  IF v_reverse THEN RETURN jsonb_build_object('status','actor_ambiguous'); END IF;
  IF v_link IS NOT NULL THEN
    IF v_direct THEN RETURN jsonb_build_object('status','actor_ambiguous'); END IF;
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_link) THEN RETURN jsonb_build_object('status','actor_unmapped'); END IF;
    RETURN jsonb_build_object('status','ok','mode','linked','localUserId',v_link);
  END IF;
  IF v_direct THEN RETURN jsonb_build_object('status','ok','mode','direct','localUserId',_hub_user_id); END IF;
  RETURN jsonb_build_object('status','actor_unmapped');
END; $$;
REVOKE ALL ON FUNCTION public.resolve_hub_actor_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_hub_actor_v1(uuid) TO service_role;

-- Per-org authorization: remove only the last-used profiles.organization_id requirement from the
-- two staff RPCs (roles unchanged). Exact text replacement of the deployed definitions, fail if absent.
DO $do$
DECLARE d text; f regprocedure; old text := E'IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id=p_actor_user_id AND organization_id=p_organization_id)\n     OR NOT EXISTS';
BEGIN
  FOREACH f IN ARRAY ARRAY['public.planning_mobile_staff_command_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,date,text[])'::regprocedure,
                           'public.planning_mobile_staff_context_v1(uuid,uuid,uuid)'::regprocedure] LOOP
    d := pg_get_functiondef(f);
    IF position(old IN d) = 0 THEN RAISE EXCEPTION 'staff_rpc_definition_unexpected: %', f; END IF;
    EXECUTE replace(d, old, 'IF NOT EXISTS');
  END LOOP;
END $do$;

-- Explicit, user-authorized administrator mapping for exactly one existing pair (2026-10-13).
DO $$
DECLARE v_hub uuid := '53bbef2d-c841-4b6f-9ece-5ed9cbb543f4'; v_local uuid := 'ed24974f-49c8-478c-a3a9-385e9a725547';
BEGIN
  IF current_database() <> 'postgres' OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_local) THEN
    RAISE NOTICE 'hub link skipped: local account absent'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=v_hub) THEN RAISE EXCEPTION 'hub_link_conflict_direct_account'; END IF;
  IF EXISTS (SELECT 1 FROM public.hub_identity_links WHERE hub_user_id IN (v_hub,v_local) OR local_user_id IN (v_hub,v_local)) THEN
    RAISE EXCEPTION 'hub_link_conflict_existing_link';
  END IF;
  INSERT INTO public.hub_identity_links(hub_user_id,local_user_id,link_source,authorized_reason)
  VALUES (v_hub,v_local,'explicit_admin_mapping','Account owner authorized linking HUB subject to existing adopted local account (Brain mobile Operations incident 2026-10-13); no role changes.');
END $$;