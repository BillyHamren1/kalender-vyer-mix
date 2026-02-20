
-- Enable RLS on tables that have policies but RLS is disabled
ALTER TABLE public.booking_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
