UPDATE active_time_registrations
SET status='stopped', stopped_at=now(), stop_source='debug-time-intelligence/manual_stop_test'
WHERE id='e3148a8b-6e54-40ab-aa44-860e7250c1b4' AND status='active';