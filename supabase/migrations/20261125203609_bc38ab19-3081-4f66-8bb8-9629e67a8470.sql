CREATE TABLE public.booking_product_rebuild_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  booking_id text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  reason text NOT NULL,
  authorized_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  consumed_at timestamptz,
  consumed_result jsonb
);
GRANT ALL ON public.booking_product_rebuild_authorizations TO service_role;
ALTER TABLE public.booking_product_rebuild_authorizations ENABLE ROW LEVEL SECURITY;
CREATE INDEX booking_product_rebuild_auth_lookup ON public.booking_product_rebuild_authorizations (organization_id, booking_id, source_updated_at) WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.product_rebuild_authorization(p_organization_id uuid, p_booking_id text, p_source_updated_at timestamptz)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.booking_product_rebuild_authorizations
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id
    AND source_updated_at = p_source_updated_at
    AND consumed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.consume_product_rebuild_authorization(p_authorization_id uuid, p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.booking_product_rebuild_authorizations
     SET consumed_at = now(), consumed_result = p_result
   WHERE id = p_authorization_id AND consumed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.product_rebuild_authorization(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_product_rebuild_authorization(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_rebuild_authorization(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_product_rebuild_authorization(uuid, jsonb) TO service_role;