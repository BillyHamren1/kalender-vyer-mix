DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.staff_day_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.staff_day_submissions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.staff_day_submissions
  ADD CONSTRAINT staff_day_submissions_status_check
  CHECK (status IN (
    'submitted',
    'edited',
    'ai_flagged',
    'needs_user_attention',
    'needs_control',
    'correction_requested',
    'approved',
    'payroll_approved',
    'rejected',
    'withdrawn'
  ));