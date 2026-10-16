ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_calendar_scope_check;
ALTER TABLE public.todos ADD CONSTRAINT todos_calendar_scope_check
  CHECK (calendar_scope IN ('team_planning','my_calendar','warehouse'));
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS todos_external_ref_uniq
  ON public.todos (organization_id, external_source, external_ref)
  WHERE external_source IS NOT NULL AND external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS todos_warehouse_day_idx
  ON public.todos (organization_id, calendar_scope, scheduled_date);

INSERT INTO public.todo_types (organization_id, key, label, is_builtin)
SELECT o.id, t.key, t.label, true
FROM public.organizations o
CROSS JOIN (VALUES ('warehouse_task','Lageruppgift'),('repair_care','Reparation & vård')) AS t(key,label)
WHERE NOT EXISTS (SELECT 1 FROM public.todo_types x WHERE x.organization_id = o.id AND x.key = t.key);

CREATE OR REPLACE FUNCTION public.seed_warehouse_todo_types_for_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.todo_types (organization_id, key, label, is_builtin)
  SELECT NEW.id, t.key, t.label, true
  FROM (VALUES ('warehouse_task','Lageruppgift'),('repair_care','Reparation & vård')) AS t(key,label)
  WHERE NOT EXISTS (SELECT 1 FROM public.todo_types x WHERE x.organization_id = NEW.id AND x.key = t.key);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_warehouse_todo_types_for_new_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS seed_warehouse_todo_types_on_org ON public.organizations;
CREATE TRIGGER seed_warehouse_todo_types_on_org AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_warehouse_todo_types_for_new_org();