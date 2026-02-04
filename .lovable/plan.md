

# Implementera Rollsystem för Planerings-modulen

## Översikt
Skapar ett komplett rollsystem med de specifika rollerna för EventFlow-ekosystemet: `admin`, `forsaljning`, `projekt`, `lager`. Endast användare med rollen `projekt` eller `lager` får åtkomst till Planerings-appen.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Rollstruktur                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Roll            │  Planering  │  Bokning  │  Lager           │
│   ────────────────┼─────────────┼───────────┼─────────         │
│   admin           │     ✅      │    ✅     │    ✅            │
│   forsaljning     │     ❌      │    ✅     │    ❌            │
│   projekt         │     ✅      │    ❌     │    ❌            │
│   lager           │     ✅      │    ❌     │    ✅            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Del 1: Databas-schema

### Skapa app_role enum

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'forsaljning', 'projekt', 'lager');
```

### Skapa user_roles-tabell

```sql
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

### Skapa has_role-funktion (Security Definer)

```sql
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
```

### Skapa has_planning_access-funktion

En bekvämlighets-funktion som kontrollerar om användaren har åtkomst till Planering:

```sql
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
```

### RLS-policy för user_roles

```sql
-- Användare kan se sina egna roller
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins kan hantera alla roller (via service role eller Edge Function)
```

---

## Del 2: Uppdatera Webhook-funktionen

Uppdaterar `receive-user-sync` för att också skapa roller:

**Ändringar i `supabase/functions/receive-user-sync/index.ts`:**

```typescript
// Efter att användaren skapats:
if (newUser.user?.id && roles && Array.isArray(roles)) {
  for (const role of roles) {
    // Endast tillåtna roller
    if (['admin', 'forsaljning', 'projekt', 'lager'].includes(role)) {
      await adminClient
        .from('user_roles')
        .insert({ user_id: newUser.user.id, role })
        .select();
    }
  }
}
```

---

## Del 3: React Hook för rollkontroll

Skapar en hook för att kontrollera användarens roller i frontend:

**Ny fil:** `src/hooks/useUserRoles.ts`

```typescript
export const useUserRoles = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Hämtar roller från user_roles-tabellen
  // Exponerar: hasRole(), hasPlanningAccess, isAdmin, etc.
};
```

---

## Del 4: Uppdatera ProtectedRoute

Lägger till rollkontroll i `ProtectedRoute`:

**Ändringar i `src/components/auth/ProtectedRoute.tsx`:**

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: ('admin' | 'projekt' | 'lager')[];
}

// Kontrollerar att användaren har minst en av de krävda rollerna
```

---

## Del 5: Uppdatera TypeScript-typer

Lägger till de nya tabellerna i `src/integrations/supabase/types.ts`:

- `user_roles` tabell med `app_role` enum
- Typade interfaces för rollhantering

---

## Filer som skapas/ändras

| Fil | Ändring |
|-----|---------|
| **Databas-migration** | Ny: `app_role` enum, `user_roles` tabell, `has_role` + `has_planning_access` funktioner |
| `supabase/functions/receive-user-sync/index.ts` | Lägg till rollskapande efter user creation |
| `src/hooks/useUserRoles.ts` | **Ny**: Hook för att hämta och kontrollera roller |
| `src/components/auth/ProtectedRoute.tsx` | Lägg till rollkontroll |
| `src/integrations/supabase/types.ts` | Lägg till typer för user_roles |

---

## Tekniska detaljer

### Säker rollkontroll
- Roller hämtas från databasen, ALDRIG från localStorage
- `has_role` funktionen är SECURITY DEFINER för att undvika RLS-rekursion
- Admin-roller kan endast sättas via service_role (Edge Functions)

### Synkronisering med Hubben
När Hubben skickar en användare med roller, t.ex.:
```json
{
  "email": "anna@foretag.se",
  "roles": ["projekt", "lager"]
}
```

Så skapas automatiskt två rader i `user_roles`:
- `user_id: xxx, role: 'projekt'`
- `user_id: xxx, role: 'lager'`

### Åtkomstkontroll i appen
```typescript
// I ProtectedRoute
const { hasPlanningAccess } = useUserRoles();

if (!hasPlanningAccess) {
  return <AccessDenied message="Du har inte behörighet till Planering" />;
}
```

