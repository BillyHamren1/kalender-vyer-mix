-- Job conversation messages table
CREATE TABLE public.job_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  sender_id text NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'staff',
  content text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_messages_booking_id ON public.job_messages (booking_id, created_at);
CREATE INDEX idx_job_messages_org ON public.job_messages (organization_id);

ALTER TABLE public.job_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_job_messages"
  ON public.job_messages
  FOR ALL
  TO public
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.job_messages;