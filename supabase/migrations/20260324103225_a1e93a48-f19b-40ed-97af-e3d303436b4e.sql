
CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  related_supplier_id uuid REFERENCES public.project_suppliers(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'supplier', 'client')),
  message text NOT NULL,
  sender_name text NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_messages_project ON public.project_messages(project_id);
CREATE INDEX idx_project_messages_type ON public.project_messages(project_id, type);
CREATE INDEX idx_project_messages_supplier ON public.project_messages(related_supplier_id) WHERE related_supplier_id IS NOT NULL;

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project messages in their org"
  ON public.project_messages FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert project messages in their org"
  ON public.project_messages FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete own project messages"
  ON public.project_messages FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER set_project_messages_org
  BEFORE INSERT ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
