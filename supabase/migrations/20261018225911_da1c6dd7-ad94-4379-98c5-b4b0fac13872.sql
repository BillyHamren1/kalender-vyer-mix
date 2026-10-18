REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.wms_change_events, public.wms_change_cursors FROM authenticated, anon;
REVOKE SELECT ON public.wms_change_events, public.wms_change_cursors FROM anon;
REVOKE ALL ON SEQUENCE public.wms_change_events_id_seq FROM authenticated, anon;