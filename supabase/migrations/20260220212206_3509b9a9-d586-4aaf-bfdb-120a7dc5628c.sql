
-- ============================================
-- RLS POLICIES FOR CORE TABLES
-- Filter by organization_id using get_user_organization_id(auth.uid())
-- ============================================

-- 1. BOOKINGS
DROP POLICY IF EXISTS "Allow all operations on bookings" ON public.bookings;
DROP POLICY IF EXISTS "Allow authenticated users to view confirmed bookings" ON public.bookings;

CREATE POLICY "org_filter_bookings" ON public.bookings
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 2. BOOKING_PRODUCTS
DROP POLICY IF EXISTS "Allow all operations on booking_products" ON public.booking_products;

CREATE POLICY "org_filter_booking_products" ON public.booking_products
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 3. BOOKING_ATTACHMENTS
DROP POLICY IF EXISTS "Allow all operations on booking_attachments" ON public.booking_attachments;

CREATE POLICY "org_filter_booking_attachments" ON public.booking_attachments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 4. BOOKING_CHANGES
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.booking_changes;

CREATE POLICY "org_filter_booking_changes" ON public.booking_changes
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 5. BOOKING_STAFF_ASSIGNMENTS
-- Enable RLS first (was disabled)
ALTER TABLE public.booking_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_booking_staff_assignments" ON public.booking_staff_assignments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 6. CALENDAR_EVENTS
DROP POLICY IF EXISTS "Allow all operations on calendar_events" ON public.calendar_events;

CREATE POLICY "org_filter_calendar_events" ON public.calendar_events
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 7. STAFF_MEMBERS
-- Note: staff_members has sensitive data but no password hashes
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on staff_members" ON public.staff_members;

CREATE POLICY "org_filter_staff_members" ON public.staff_members
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 8. STAFF_ACCOUNTS (contains password_hash - sensitive!)
DROP POLICY IF EXISTS "Allow all operations on staff_accounts" ON public.staff_accounts;

CREATE POLICY "org_filter_staff_accounts" ON public.staff_accounts
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 9. STAFF_ASSIGNMENTS
DROP POLICY IF EXISTS "Allow all access to staff_assignments" ON public.staff_assignments;
DROP POLICY IF EXISTS "Allow delete for all users" ON public.staff_assignments;
DROP POLICY IF EXISTS "Allow insert for all users" ON public.staff_assignments;
DROP POLICY IF EXISTS "Allow select for all users" ON public.staff_assignments;
DROP POLICY IF EXISTS "Allow update for all users" ON public.staff_assignments;

CREATE POLICY "org_filter_staff_assignments" ON public.staff_assignments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 10. STAFF_AVAILABILITY
DROP POLICY IF EXISTS "Allow all operations on staff_availability" ON public.staff_availability;

CREATE POLICY "org_filter_staff_availability" ON public.staff_availability
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 11. STAFF_JOB_AFFINITY
DROP POLICY IF EXISTS "Allow all access to staff_job_affinity" ON public.staff_job_affinity;

CREATE POLICY "org_filter_staff_job_affinity" ON public.staff_job_affinity
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
