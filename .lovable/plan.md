

# Användarsynkronisering från EventFlow Hub

## Översikt
Implementerar stöd för att ta emot användare som skapas centralt i EventFlow Hub. Eftersom projektet är ett externt Supabase-projekt (inte Lovable Cloud) rekommenderas **Alternativ A** - dela credentials med Hubben.

```text
┌─────────────────────┐                    ┌────────────────────────────────┐
│   EventFlow Hub     │                    │   Planerings-modulen           │
│                     │                    │                                │
│  Admin skapar       │   Service Role     │  Supabase Auth                 │
│  ny användare       │ ──────────────────▶│  ├─ Användare skapas           │
│                     │   API-anrop        │  └─ Trigger körs               │
└─────────────────────┘                    │         │                      │
                                           │         ▼                      │
                                           │  Profiles-tabell               │
                                           │  (automatiskt via trigger)     │
                                           └────────────────────────────────┘
```

---

## Del 1: Databas-schema

Skapar nödvändiga tabeller för profilhantering.

### Profiles-tabell
Lagrar användarinformation som är tillgänglig via RLS:

```sql
CREATE TABLE public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Automatisk trigger
Skapar profil automatiskt när en användare registreras i Auth:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### RLS-policies
Skyddar profildata:

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Användare kan se sin egen profil
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Alla inloggade kan se grundläggande profilinfo (för team-visning)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
```

---

## Del 2: User Roles (Valfritt men rekommenderat)

Om ni vill hantera roller lokalt i Planerings-appen:

### Enum och tabell

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'planner', 'warehouse', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
```

### Security Definer Function

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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

---

## Del 3: Webhook-mottagare (Extra säkerhet)

Även om Hubben kan skapa användare direkt via service_role, kan en webhook-funktion ge extra kontroll och loggning.

**Fil:** `supabase/functions/receive-user-sync/index.ts`

Funktionen:
- Verifierar webhook-hemlighet i header
- Tar emot användardata från Hubben
- Skapar användare via Admin API
- Loggar all aktivitet
- Returnerar bekräftelse

---

## Del 4: Config-uppdatering

Lägger till den nya funktionen i `supabase/config.toml`:

```toml
[functions.receive-user-sync]
verify_jwt = false
```

---

## Del 5: Secret att konfigurera

Om ni väljer att också använda webhook-funktionen:

| Secret | Beskrivning |
|--------|-------------|
| `WEBHOOK_SECRET` | Hemlig nyckel för att verifiera webhook-anrop (minst 32 tecken) |

---

## Credentials att skicka till EventFlow Hub-teamet

### Alternativ A (Rekommenderat):

| Credential | Var hittar ni det |
|------------|-------------------|
| `PLANERING_SUPABASE_URL` | `https://pihrhltinhewhoxefjxv.supabase.co` |
| `PLANERING_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role |

### Alternativ B (Om webhook):

| Credential | Värde |
|------------|-------|
| `PLANERING_WEBHOOK_URL` | `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/receive-user-sync` |
| `PLANERING_WEBHOOK_SECRET` | Er egen hemlighet (minst 32 tecken) |

---

## Filer som skapas/ändras

| Resurs | Ändring |
|--------|---------|
| **Databas** | Ny `profiles`-tabell med trigger |
| **Databas** | (Valfritt) `user_roles`-tabell + `has_role`-funktion |
| `supabase/functions/receive-user-sync/index.ts` | Ny webhook-mottagare |
| `supabase/config.toml` | Lägg till receive-user-sync |

---

## Rekommendation

1. **Primärt: Alternativ A** - Dela service_role-nyckeln med Hubben för enkel och direkt synkronisering
2. **Sekundärt: Lägg till webhook** - För extra loggning och kontroll om ni vill det senare

Ska jag implementera:
- ✅ Profiles-tabell med trigger (rekommenderas starkt)
- ✅ Webhook-funktion (för framtida flexibilitet)
- ❓ User roles-tabell (behöver ni rollhantering i appen?)

