ALTER TABLE public.workday_flags DROP CONSTRAINT IF EXISTS workday_flags_flag_type_check;

ALTER TABLE public.workday_flags ADD CONSTRAINT workday_flags_flag_type_check
CHECK (flag_type IN (
  'missing_break',
  'unclear_day_end',
  'presence_without_report',
  'activity_ended_day_continues',
  'geofence_presence_mismatch',
  'team_time_deviation',
  'unreasonable_travel',
  'time_gap',
  'missing_report',
  'long_day',
  'overlapping_times',
  'home_arrival_end_day_adjusted'
));