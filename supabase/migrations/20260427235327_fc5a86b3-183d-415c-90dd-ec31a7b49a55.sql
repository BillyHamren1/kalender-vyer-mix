-- 1) Add 'returned' to workday_review_status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'workday_review_status' AND e.enumlabel = 'returned'
  ) THEN
    ALTER TYPE public.workday_review_status ADD VALUE 'returned';
  END IF;
END $$;

-- 2) Add review_note column to workdays
ALTER TABLE public.workdays
  ADD COLUMN IF NOT EXISTS review_note text;