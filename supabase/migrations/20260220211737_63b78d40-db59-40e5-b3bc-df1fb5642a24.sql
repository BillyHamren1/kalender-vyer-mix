
-- Set default organization_id on all core tables using the helper function
ALTER TABLE public.bookings ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.booking_products ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.booking_attachments ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.booking_changes ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.booking_staff_assignments ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.calendar_events ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.staff_members ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.staff_accounts ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.staff_assignments ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.staff_availability ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.staff_job_affinity ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
