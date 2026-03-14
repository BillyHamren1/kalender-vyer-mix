CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  sender_name text NOT NULL,
  sender_type text NOT NULL DEFAULT 'planner',
  recipient_id text NOT NULL,
  recipient_name text NOT NULL,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_direct_messages_conversation ON public.direct_messages (organization_id, LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);
CREATE INDEX idx_direct_messages_recipient ON public.direct_messages (recipient_id, is_read, created_at);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_direct_messages"
  ON public.direct_messages
  FOR ALL
  TO public
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;