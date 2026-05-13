CREATE TABLE public.todo_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX idx_todo_types_org ON public.todo_types(organization_id);
ALTER TABLE public.todo_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todo_types_select_same_org" ON public.todo_types
  FOR SELECT USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todo_types_insert_same_org" ON public.todo_types
  FOR INSERT WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todo_types_update_same_org" ON public.todo_types
  FOR UPDATE USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todo_types_delete_same_org_non_builtin" ON public.todo_types
  FOR DELETE USING (organization_id = public.get_user_organization_id(auth.uid()) AND is_builtin = false);
CREATE TRIGGER set_org_todo_types
  BEFORE INSERT ON public.todo_types
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

INSERT INTO public.todo_types (organization_id, key, label, is_builtin)
SELECT o.id, t.key, t.label, true
FROM public.organizations o
CROSS JOIN (VALUES ('pickup','Upphämtning'),('delivery','Leverans'),('other','Annat')) AS t(key, label)
ON CONFLICT (organization_id, key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_todo_types_for_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.todo_types (organization_id, key, label, is_builtin) VALUES
    (NEW.id, 'pickup', 'Upphämtning', true),
    (NEW.id, 'delivery', 'Leverans', true),
    (NEW.id, 'other', 'Annat', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER seed_todo_types_after_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_todo_types_for_new_org();

CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  type_id uuid NOT NULL REFERENCES public.todo_types(id) ON DELETE RESTRICT,
  title text NOT NULL,
  booking_id text REFERENCES public.bookings(id) ON DELETE SET NULL,
  large_project_id uuid REFERENCES public.large_projects(id) ON DELETE SET NULL,
  client text,
  contact_name text,
  contact_phone text,
  contact_email text,
  address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  scheduled_date date,
  start_time time,
  end_time time,
  assigned_leader text,
  internal_notes text,
  planning_status text NOT NULL DEFAULT 'needs_planning'
    CHECK (planning_status IN ('needs_planning','planned','completed','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_todos_org_status ON public.todos(organization_id, planning_status);
CREATE INDEX idx_todos_booking ON public.todos(booking_id) WHERE booking_id IS NOT NULL;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos_select_same_org" ON public.todos
  FOR SELECT USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todos_insert_same_org" ON public.todos
  FOR INSERT WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todos_update_same_org" ON public.todos
  FOR UPDATE USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "todos_delete_same_org" ON public.todos
  FOR DELETE USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_todos
  BEFORE INSERT ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_updated_at_todos
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calendar_events
  ADD COLUMN todo_id uuid REFERENCES public.todos(id) ON DELETE CASCADE;
CREATE INDEX idx_calendar_events_todo ON public.calendar_events(todo_id) WHERE todo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_todo_planning_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _todo_id uuid;
  _remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _todo_id := OLD.todo_id;
  ELSE
    _todo_id := NEW.todo_id;
  END IF;
  IF _todo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT COUNT(*) INTO _remaining FROM public.calendar_events WHERE todo_id = _todo_id;
  IF _remaining > 0 THEN
    UPDATE public.todos SET planning_status = 'planned', updated_at = now()
     WHERE id = _todo_id AND planning_status NOT IN ('planned','completed','cancelled');
  ELSE
    UPDATE public.todos SET planning_status = 'needs_planning', updated_at = now()
     WHERE id = _todo_id AND planning_status = 'planned';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE TRIGGER calendar_events_sync_todo_status
  AFTER INSERT OR UPDATE OF todo_id OR DELETE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_todo_planning_status();