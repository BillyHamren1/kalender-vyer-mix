
DO $$
DECLARE
  org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE slug = 'frans-august';

  -- Disable only the user-defined sync triggers
  ALTER TABLE public.calendar_events DISABLE TRIGGER USER;
  ALTER TABLE public.booking_staff_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.staff_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.bookings DISABLE TRIGGER USER;

  -- bookings
  ALTER TABLE public.bookings ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.bookings SET organization_id = %L', org_id);
  ALTER TABLE public.bookings ALTER COLUMN organization_id SET NOT NULL;

  -- booking_products
  ALTER TABLE public.booking_products ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.booking_products SET organization_id = %L', org_id);
  ALTER TABLE public.booking_products ALTER COLUMN organization_id SET NOT NULL;

  -- booking_attachments
  ALTER TABLE public.booking_attachments ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.booking_attachments SET organization_id = %L', org_id);
  ALTER TABLE public.booking_attachments ALTER COLUMN organization_id SET NOT NULL;

  -- booking_changes
  ALTER TABLE public.booking_changes ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.booking_changes SET organization_id = %L', org_id);
  ALTER TABLE public.booking_changes ALTER COLUMN organization_id SET NOT NULL;

  -- booking_staff_assignments
  ALTER TABLE public.booking_staff_assignments ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.booking_staff_assignments SET organization_id = %L', org_id);
  ALTER TABLE public.booking_staff_assignments ALTER COLUMN organization_id SET NOT NULL;

  -- calendar_events
  ALTER TABLE public.calendar_events ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.calendar_events SET organization_id = %L', org_id);
  ALTER TABLE public.calendar_events ALTER COLUMN organization_id SET NOT NULL;

  -- staff_members
  ALTER TABLE public.staff_members ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.staff_members SET organization_id = %L', org_id);
  ALTER TABLE public.staff_members ALTER COLUMN organization_id SET NOT NULL;

  -- staff_accounts
  ALTER TABLE public.staff_accounts ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.staff_accounts SET organization_id = %L', org_id);
  ALTER TABLE public.staff_accounts ALTER COLUMN organization_id SET NOT NULL;

  -- staff_assignments
  ALTER TABLE public.staff_assignments ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.staff_assignments SET organization_id = %L', org_id);
  ALTER TABLE public.staff_assignments ALTER COLUMN organization_id SET NOT NULL;

  -- staff_availability
  ALTER TABLE public.staff_availability ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.staff_availability SET organization_id = %L', org_id);
  ALTER TABLE public.staff_availability ALTER COLUMN organization_id SET NOT NULL;

  -- staff_job_affinity
  ALTER TABLE public.staff_job_affinity ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  EXECUTE format('UPDATE public.staff_job_affinity SET organization_id = %L', org_id);
  ALTER TABLE public.staff_job_affinity ALTER COLUMN organization_id SET NOT NULL;

  -- Re-enable user triggers
  ALTER TABLE public.calendar_events ENABLE TRIGGER USER;
  ALTER TABLE public.booking_staff_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.staff_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.bookings ENABLE TRIGGER USER;
END $$;
