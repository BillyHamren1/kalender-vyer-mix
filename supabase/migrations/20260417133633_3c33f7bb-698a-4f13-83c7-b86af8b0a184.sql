DROP INDEX IF EXISTS time_reports_source_entry_uniq;
ALTER TABLE public.time_reports
  ADD CONSTRAINT time_reports_source_entry_id_key UNIQUE (source_entry_id);