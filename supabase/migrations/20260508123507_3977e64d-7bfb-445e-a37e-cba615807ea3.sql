UPDATE public.active_time_registrations
SET status='stopped', stopped_at=now(), stop_source='debug_health_check_admin_stop_2', stopped_by='time-engine-health-check', updated_at=now()
WHERE staff_id='staff_1775736725128_wfzzhpwus' AND status='active';