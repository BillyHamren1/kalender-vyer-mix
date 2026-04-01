ALTER TABLE public.establishment_tasks DROP CONSTRAINT IF EXISTS establishment_tasks_status_check;

UPDATE public.establishment_tasks SET status = 'todo' WHERE status = 'not_started';
UPDATE public.establishment_tasks SET status = 'done' WHERE status = 'cancelled';

ALTER TABLE public.establishment_tasks ADD CONSTRAINT establishment_tasks_status_check CHECK (status IN ('todo', 'in_progress', 'done', 'blocked'));