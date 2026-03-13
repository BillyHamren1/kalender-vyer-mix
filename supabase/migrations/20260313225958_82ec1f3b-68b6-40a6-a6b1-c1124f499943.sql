
-- Create staff_messages table
CREATE TABLE public.staff_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  staff_name text NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  booking_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid())
);

-- Enable RLS
ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "org_filter_staff_messages" ON public.staff_messages
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
