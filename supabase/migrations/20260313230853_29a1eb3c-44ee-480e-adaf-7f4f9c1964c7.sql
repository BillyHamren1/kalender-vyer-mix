
-- Add sender_type and admin fields to support two-way chat
ALTER TABLE public.staff_messages 
  ADD COLUMN sender_type text NOT NULL DEFAULT 'staff',
  ADD COLUMN sender_name text;

-- Update existing rows
UPDATE public.staff_messages SET sender_name = staff_name WHERE sender_name IS NULL;
