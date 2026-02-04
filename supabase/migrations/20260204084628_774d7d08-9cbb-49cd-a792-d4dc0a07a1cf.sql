-- ============================================
-- PROJEKT STORT - Databastabeller
-- ============================================

-- Huvudtabell för stora projekt (multi-booking)
CREATE TABLE public.large_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  project_leader TEXT,
  location TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Koppling mellan stora projekt och bokningar
CREATE TABLE public.large_project_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  display_name TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(large_project_id, booking_id)
);

-- Uppgifter för stora projekt
CREATE TABLE public.large_project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  deadline DATE,
  completed BOOLEAN DEFAULT FALSE,
  is_info_only BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Filer för stora projekt
CREATE TABLE public.large_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kommentarer för stora projekt
CREATE TABLE public.large_project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inköp/kostnader för stora projekt (gemensamma kostnader)
CREATE TABLE public.large_project_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  category TEXT,
  supplier TEXT,
  purchase_date DATE,
  receipt_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budget för stora projekt
CREATE TABLE public.large_project_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  budgeted_hours NUMERIC DEFAULT 0,
  hourly_rate NUMERIC DEFAULT 450,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(large_project_id)
);

-- Lägg till referens från bookings till large_projects
ALTER TABLE public.bookings ADD COLUMN large_project_id UUID REFERENCES public.large_projects(id);

-- Skapa index för bättre prestanda
CREATE INDEX idx_large_project_bookings_project ON public.large_project_bookings(large_project_id);
CREATE INDEX idx_large_project_bookings_booking ON public.large_project_bookings(booking_id);
CREATE INDEX idx_large_project_tasks_project ON public.large_project_tasks(large_project_id);
CREATE INDEX idx_bookings_large_project ON public.bookings(large_project_id);

-- Updated_at trigger för large_projects
CREATE TRIGGER update_large_projects_updated_at
  BEFORE UPDATE ON public.large_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger för large_project_tasks
CREATE TRIGGER update_large_project_tasks_updated_at
  BEFORE UPDATE ON public.large_project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger för large_project_budget
CREATE TRIGGER update_large_project_budget_updated_at
  BEFORE UPDATE ON public.large_project_budget
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();