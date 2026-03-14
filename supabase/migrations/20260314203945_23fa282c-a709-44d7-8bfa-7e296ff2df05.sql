
-- Broadcast messages from planners to staff groups
CREATE TABLE public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL,
  audience text NOT NULL DEFAULT 'all_today', -- 'all_today', 'job_staff', 'active_staff', 'selected_staff'
  audience_booking_id text, -- for job_staff audience
  audience_staff_ids text[], -- for selected_staff audience
  category text NOT NULL DEFAULT 'info', -- 'info', 'weather', 'schedule', 'logistics', 'urgent'
  is_read_by text[] NOT NULL DEFAULT '{}', -- staff IDs who have read
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_broadcast_messages" ON public.broadcast_messages
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_messages;
