
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_pickup boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_pickup boolean NOT NULL DEFAULT false;
ALTER TABLE public.large_projects ADD COLUMN IF NOT EXISTS customer_pickup boolean NOT NULL DEFAULT false;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS customer_pickup boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bookings.customer_pickup IS 'True when customer picks up gear themselves at warehouse instead of delivery (rig/rigDown rendered pink/purple).';
COMMENT ON COLUMN public.projects.customer_pickup IS 'Customer self-pickup flag — mirrored to calendar_events for visual styling.';
COMMENT ON COLUMN public.large_projects.customer_pickup IS 'Customer self-pickup flag for entire large project.';
COMMENT ON COLUMN public.calendar_events.customer_pickup IS 'Per-event flag for "kund hämtar själv" — flips rig/rigDown color to pink/purple.';
