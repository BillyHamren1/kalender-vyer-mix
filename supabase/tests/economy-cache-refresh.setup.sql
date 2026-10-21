CREATE TABLE public.economy_cache (
  booking_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL
);
