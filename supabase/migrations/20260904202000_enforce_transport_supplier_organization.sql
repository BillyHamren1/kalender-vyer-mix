-- Prevent cross-organization supplier references even if a caller guesses a UUID.
CREATE OR REPLACE FUNCTION public.validate_transport_supplier_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  supplier_organization_id uuid;
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id
  INTO supplier_organization_id
  FROM public.suppliers
  WHERE id = NEW.supplier_id;

  IF supplier_organization_id IS NULL OR supplier_organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Transport supplier must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_transport_supplier_organization
  ON public.transport_assignments;
CREATE TRIGGER validate_transport_supplier_organization
BEFORE INSERT OR UPDATE OF supplier_id, organization_id
ON public.transport_assignments
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_supplier_organization();

REVOKE ALL ON FUNCTION public.validate_transport_supplier_organization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_transport_supplier_organization() TO authenticated, service_role;
