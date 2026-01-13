-- Add project_leader column to projects table
ALTER TABLE public.projects 
ADD COLUMN project_leader TEXT;

-- Add is_info_only column to project_tasks table
ALTER TABLE public.project_tasks 
ADD COLUMN is_info_only BOOLEAN DEFAULT false;