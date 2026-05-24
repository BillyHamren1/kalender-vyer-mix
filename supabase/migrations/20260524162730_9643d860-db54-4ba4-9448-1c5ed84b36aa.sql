-- 1) profiles
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable within same organization"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    OR id = auth.uid()
  );

-- 2) booking_sync_jobs
DROP POLICY IF EXISTS "Authenticated users can view sync jobs" ON public.booking_sync_jobs;
CREATE POLICY "Sync jobs viewable within same organization"
  ON public.booking_sync_jobs FOR SELECT TO authenticated
  USING (organization_id::uuid = public.get_user_organization_id(auth.uid()));

-- 3) staff_accounts: restrict SELECT to admins only (edge functions use service role)
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_accounts_select_admin_only" ON public.staff_accounts;
CREATE POLICY "staff_accounts_select_admin_only"
  ON public.staff_accounts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

-- 4) arrival_prompt_log
DROP POLICY IF EXISTS "Service role manages arrival prompts" ON public.arrival_prompt_log;
CREATE POLICY "Service role manages arrival prompts"
  ON public.arrival_prompt_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Org members can view arrival prompts" ON public.arrival_prompt_log;
CREATE POLICY "Org members can view arrival prompts"
  ON public.arrival_prompt_log FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 5) product_cost_overrides
DROP POLICY IF EXISTS "Allow all on product_cost_overrides" ON public.product_cost_overrides;
ALTER TABLE public.product_cost_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_cost_overrides_org_scoped"
  ON public.product_cost_overrides AS RESTRICTIVE FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "product_cost_overrides_authenticated_access"
  ON public.product_cost_overrides FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- 6) organizations
DROP POLICY IF EXISTS "Allow authenticated read on organizations" ON public.organizations;
CREATE POLICY "Users can view own organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));

-- 7) storage: project-files
DROP POLICY IF EXISTS "Allow upload to project files" ON storage.objects;
DROP POLICY IF EXISTS "Allow update project files" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete project files" ON storage.objects;
CREATE POLICY "project_files_authenticated_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-files');
CREATE POLICY "project_files_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-files') WITH CHECK (bucket_id = 'project-files');
CREATE POLICY "project_files_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-files');

-- 8) storage: chat-attachments
DROP POLICY IF EXISTS "Chat attachments are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update chat attachments" ON storage.objects;
CREATE POLICY "chat_attachments_authenticated_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');
CREATE POLICY "chat_attachments_authenticated_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "chat_attachments_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
