ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
DROP INDEX IF EXISTS public.user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_org_key
  ON public.user_roles (user_id, role, organization_id);