
-- Device tokens table for push notifications
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android', -- 'android' or 'ios'
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, token)
);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policy: service role only (edge functions manage tokens)
CREATE POLICY "Service role manages device tokens"
  ON public.device_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger to auto-set organization_id
CREATE TRIGGER set_device_tokens_org_id
  BEFORE INSERT ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();

-- Trigger to update updated_at
CREATE TRIGGER update_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Push notification log for debugging
CREATE TABLE public.push_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  notification_type text NOT NULL, -- 'message', 'assignment', 'schedule', 'broadcast'
  data jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true,
  error_message text,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid())
);

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages push logs"
  ON public.push_notification_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_push_log_org_id
  BEFORE INSERT ON public.push_notification_log
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();
