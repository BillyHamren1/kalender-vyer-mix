
-- 1. Create organizations table
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on organizations"
  ON public.organizations FOR SELECT
  USING (true);

-- 2. Insert first organization
INSERT INTO public.organizations (name, slug)
VALUES ('Frans August', 'frans-august');

-- 3. Create SECURITY DEFINER helper function
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;
$$;

-- 4. Set all existing profiles to the new organization
UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'frans-august')
WHERE organization_id IS NULL;
