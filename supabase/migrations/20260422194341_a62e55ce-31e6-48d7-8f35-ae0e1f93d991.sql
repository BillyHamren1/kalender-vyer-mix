ALTER TABLE public.staff_locations
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS app_build text,
  ADD COLUMN IF NOT EXISTS app_platform text;

COMMENT ON COLUMN public.staff_locations.app_version IS 'Mobile app version reported with last GPS ping (e.g. "1.4.2")';
COMMENT ON COLUMN public.staff_locations.app_build IS 'Mobile app build number reported with last GPS ping (e.g. "87")';
COMMENT ON COLUMN public.staff_locations.app_platform IS 'Mobile platform reported with last GPS ping: ios | android | web';