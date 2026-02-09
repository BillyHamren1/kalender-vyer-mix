
-- Create transport_email_log table to track all email communications for transport assignments
CREATE TABLE public.transport_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.transport_assignments(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  custom_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_by TEXT,
  email_type TEXT NOT NULL DEFAULT 'transport_request'
);

-- Enable RLS
ALTER TABLE public.transport_email_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read email logs
CREATE POLICY "Authenticated users can read email logs"
  ON public.transport_email_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role inserts (from edge functions)
CREATE POLICY "Service role can insert email logs"
  ON public.transport_email_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Index for fast lookups by assignment and booking
CREATE INDEX idx_transport_email_log_assignment ON public.transport_email_log(assignment_id);
CREATE INDEX idx_transport_email_log_booking ON public.transport_email_log(booking_id);
