
## Hoppa över rollkontroll vid manuell inloggning från /auth

### Vad jag kommer göra
Ändra så att användare som loggar in via `/auth`-sidan (lösenord, magic link, eller password reset) kommer in i appen även om de saknar roller i `user_roles`-tabellen. Istället för att visa "Åtkomst nekad" vid inloggning får de en tydlig vy som förklarar att de behöver kontakta admin för att få roller tilldelade.

### Teknisk lösning

#### 1. Lägg till flagga i `location.state` när inloggning lyckas
När användaren loggar in från `/auth` sätter jag en flagga `skipRoleCheck: true` i navigerings-state. Detta följer med till nästa sida.

**Fil:** `src/pages/Auth.tsx`
- Efter lyckad inloggning: `navigate(from, { replace: true, state: { skipRoleCheck: true } })`

#### 2. Uppdatera `ProtectedRoute` att respektera flaggan
`ProtectedRoute` kollar om `location.state?.skipRoleCheck` är satt. Om ja, hoppar den över rollkontroll och släpper igenom användaren.

**Fil:** `src/components/auth/ProtectedRoute.tsx`
- Lägg till: `const skipRoleCheck = (location.state as any)?.skipRoleCheck === true;`
- I access-kontrollen: `if (skipRoleCheck || hasAccess) { return <>{children}</>; }`

#### 3. Alternativ: "Roller saknas"-vy inne i appen
Om du vill att användare som saknar roller ska se en specifik sida inne i appen (inte blockeras helt), kan vi skapa en `NoRolesPage` som visas när användaren är inloggad men saknar roller. Detta är säkrare än att helt hoppa över rollkontroll.

### Säkerhetsövervägande
- Detta innebär att användare utan roller kan "komma in" i appen, men de får ändå inte åtkomst till data pga RLS-policies i databasen.
- Om du hellre vill ha en dedikerad "väntar på roller"-sida istället för att helt skippa kontrollen, kan jag implementera det istället.

### Filer som ändras
- `src/pages/Auth.tsx` - lägger till state vid navigation efter login
- `src/components/auth/ProtectedRoute.tsx` - respekterar skipRoleCheck-flagga
