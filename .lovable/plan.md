
# Autentisering: Skyddade routes + Fallback-inloggning

## Översikt
Implementerar krav på inloggning för hela appen med en fallback-inloggningssida för användare som inte kommer via SSO från Hubben.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Användarflöde                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     SSO-token?      ┌─────────────────────┐   │
│  │   Besökare  │ ────────────────────│  SSO-verifiering    │   │
│  │   kommer    │        JA           │  (befintlig hook)   │   │
│  └─────────────┘                     └──────────┬──────────┘   │
│        │                                        │              │
│        │ NEJ                                    │ OK           │
│        ▼                                        ▼              │
│  ┌─────────────────────┐               ┌───────────────────┐   │
│  │  Inloggad redan?    │               │   Appen öppnas    │   │
│  └─────────────────────┘               │   (Dashboard)     │   │
│        │                               └───────────────────┘   │
│   NEJ  │  JA                                    ▲              │
│        ▼   ────────────────────────────────────-┘              │
│  ┌─────────────────────┐                                       │
│  │  Fallback-login     │                                       │
│  │  (/auth)            │                                       │
│  └─────────────────────┘                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Del 1: AuthContext och AuthProvider

Skapar en global autentiseringskontext som håller koll på användarens inloggningsstatus.

**Fil:** `src/contexts/AuthContext.tsx`

```typescript
// Innehåller:
- user: User | null
- session: Session | null
- isLoading: boolean
- signIn(email, password)
- signOut()
```

Denna context:
- Lyssnar på `onAuthStateChange` för att hålla session uppdaterad
- Kollar befintlig session vid start med `getSession()`
- Exponerar inloggnings- och utloggningsfunktioner

---

## Del 2: ProtectedRoute-komponent

En wrapper-komponent som kontrollerar om användaren är inloggad innan innehållet visas.

**Fil:** `src/components/auth/ProtectedRoute.tsx`

```typescript
// Om inte inloggad → redirect till /auth
// Om inloggad → visa children
// Visar loading-spinner under kontroll
```

---

## Del 3: Fallback-inloggningssida

En enkel inloggningssida för användare som inte kommer via SSO.

**Fil:** `src/pages/Auth.tsx`

Innehåller:
- E-post/lösenord-inloggning (ingen signup - användare skapas via SSO)
- Snyggt UI som matchar resten av appen
- Felhantering med tydliga meddelanden
- Redirect till dashboard efter lyckad inloggning
- Information om att man normalt loggar in via Hubben

---

## Del 4: Uppdatera App.tsx

Lägger till AuthProvider och skyddar alla routes utom `/auth`.

**Ändringar i `src/App.tsx`:**

```typescript
// Wrappar hela appen med AuthProvider
// Alla routes utom /auth går genom ProtectedRoute
```

---

## Del 5: Uppdatera useSsoListener

Hooken behöver informera AuthContext om lyckad SSO-inloggning så att appen reagerar direkt utan reload.

**Ändringar i `src/hooks/useSsoListener.ts`:**
- Efter lyckad verifiering behövs ingen ändring - Supabase `onAuthStateChange` i AuthContext fångar upp sessionen automatiskt

---

## Filer som skapas/ändras

| Fil | Ändring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | **Ny** - Global auth-state |
| `src/components/auth/ProtectedRoute.tsx` | **Ny** - Route-skydd |
| `src/pages/Auth.tsx` | **Ny** - Inloggningssida |
| `src/App.tsx` | Lägg till AuthProvider + skydda routes |

---

## Tekniska detaljer

### AuthContext Implementation
```typescript
// Följer Supabase best practices:
// 1. Sätter upp lyssnare FÖRST
// 2. Kollar befintlig session SEDAN
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    }
  );

  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setUser(session?.user ?? null);
    setIsLoading(false);
  });

  return () => subscription.unsubscribe();
}, []);
```

### ProtectedRoute Logic
```typescript
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
```

### Inloggningssidans UI
- EventFlow-logotyp/titel
- E-post och lösenord-fält
- "Logga in"-knapp
- Informationstext: "Normalt loggas du in automatiskt via EventFlow Hub"
- Felmeddelanden vid misslyckad inloggning

---

## SSO + Fallback samverkan

1. **SSO-flöde (primärt):** 
   - Användare klickar i Hubben → SSO-token skickas → session skapas → AuthContext uppdateras → appen visas

2. **Fallback-flöde:**
   - Användare går direkt till URL → ProtectedRoute ser ingen session → redirect till `/auth` → manuell inloggning → redirect tillbaka

---

## Noteringar

- **Ingen signup:** Användare skapas via SSO från Hubben, så signup-flöde behövs inte
- **Scanner-app:** `/scanner` är för Capacitor-appen och har separat autentisering, men bör också skyddas
- **RLS-policies:** Befintliga "allow all"-policies fungerar fortsatt eftersom användare nu måste vara autentiserade för att nå appen överhuvudtaget
