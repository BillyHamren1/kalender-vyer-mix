
-- Add linked_task_id to project_messages so chat messages can reference a task
ALTER TABLE public.project_messages
ADD COLUMN linked_task_id uuid REFERENCES public.establishment_tasks(id) ON DELETE SET NULL;

-- Add index for fast lookups of messages linked to a task
CREATE INDEX idx_project_messages_linked_task ON public.project_messages(linked_task_id) WHERE linked_task_id IS NOT NULL;
