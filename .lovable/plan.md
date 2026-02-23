

# Rollsynkronisering: Hub → Planering via SSO och Sync-User

## Nuläge

Systemet har redan alla grundläggande delar på plats:
- `app_role` enum och `user_roles`-tabell finns
- `has_role()` och `has_planning_access()` SECURITY DEFINER-funktioner finns
- `receive-user-sync` synkar roller korrekt från Hub (delete + insert)
- `useUserRoles` hook läser roller korrekt på klientsidan

**Det enda som saknas är SSO-inloggningen.** Funktionen `verify-sso-token` ignorerar `roles[]` från Hubbens payload och gissar istället roller baserat på `target_view`. Det innebär att en admin som loggar in via SSO aldrig får admin-rollen — den skrivs över med "projekt" eller "lager".

## Åtgärder

### 1. Uppdatera `SsoPayload`-interface (verify-sso-token)
Lägg till `roles?: string[]` i `SsoPayload`-interfacet så att payloaden från Hubben kan innehålla rollerna.

### 2. Ersätt target_view-gissningen med Hub-roller
Nuvarande logik (rad 239-272) gör detta:
```text
target_view === 'warehouse' → lager
target_view === 'planning' → projekt
default → projekt + lager
```

Ny logik:
```text
Om payload.roles finns och inte är tom → synka dessa roller (delete + insert)
Om payload.roles saknas → fallback till target_view-logiken (bakåtkompatibilitet)
```

Detta använder samma `syncRoles`-mönster som redan fungerar i `receive-user-sync`: radera alla befintliga roller för användaren, sedan infoga de nya.

### 3. Inga databasändringar behövs
Tabellen, enum, RLS-policies och hjälpfunktioner finns redan.

## Tekniska detaljer

### Fil som ändras
`supabase/functions/verify-sso-token/index.ts`

**Interface-ändring:**
```typescript
interface SsoPayload {
  // ...existing fields...
  roles?: string[];  // ← Lägg till
}
```

**Rollsynk-logik (ersätter rad 239-272):**
```typescript
// Determine roles: prefer Hub-provided roles, fallback to target_view
const VALID_ROLES: AppRole[] = ['admin', 'forsaljning', 'projekt', 'lager'];
let rolesToSync: AppRole[] = [];

if (payload.roles && Array.isArray(payload.roles) && payload.roles.length > 0) {
  // Hub sent explicit roles — use them (authoritative source)
  rolesToSync = payload.roles.filter(r => VALID_ROLES.includes(r as AppRole)) as AppRole[];
} else {
  // Fallback: guess from target_view (backward compat)
  if (target_view === 'warehouse') rolesToSync = ['lager'];
  else if (target_view === 'planning') rolesToSync = ['projekt'];
  else rolesToSync = ['projekt', 'lager'];
}

// Full sync: delete existing + insert new (same pattern as receive-user-sync)
await supabase.from('user_roles').delete().eq('user_id', userId);

for (const role of rolesToSync) {
  await supabase.from('user_roles')
    .insert({ user_id: userId, role, organization_id: resolvedOrgId })
    .select().single();
}
```

## Resultat

| Scenario | Före | Efter |
|---|---|---|
| SSO med roles: ["admin"] | Får "projekt" (fel!) | Får "admin" (korrekt) |
| SSO med roles: ["admin","lager"] | Får "projekt"+"lager" | Får "admin"+"lager" |
| SSO utan roles (gammal Hub) | Gissar från target_view | Samma (bakåtkompatibel) |
| sync-user med roles | Fungerar redan | Ingen ändring |

