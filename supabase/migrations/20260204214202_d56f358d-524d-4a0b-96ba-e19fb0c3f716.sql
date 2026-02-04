-- Skapa app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'forsaljning', 'projekt', 'lager');

-- Skapa user_roles-tabell
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Aktivera RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS-policy: Användare kan se sina egna roller
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Skapa has_role-funktion (Security Definer för att undvika RLS-rekursion)
CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Skapa has_planning_access-funktion (bekvämlighets-funktion)
CREATE OR REPLACE FUNCTION public.has_planning_access(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'projekt', 'lager')
  )
$$;