

# Hub-integration for multi-tenant organisationer

## Bakgrund

Systemet har nu full multi-tenant-isolation i databasen (RLS + triggers), men **Edge Functions ar inte redo for flera organisationer**. Alla 10+ funktioner faller tillbaka pa `SELECT id FROM organizations LIMIT 1` nar ingen `organization_id` skickas.

Med bara 1 organisation ("Frans August") fungerar allt idag, men vid en andra organisation bryts det.

---

## Steg 1: Ny Edge Function -- `manage-organization`

Skapar en ny endpoint som Hub anropar for att registrera organisationer i detta system.

**Endpoint:** `POST /functions/v1/manage-organization`
**Auth:** `x-api-key` (anvander befintlig `WEBHOOK_SECRET`)

**Payload fran Hub:**
```text
{
  "action": "create" | "update",
  "organization": {
    "id": "<uuid fran Hub>",
    "name": "Nytt Foretag AB",
    "slug": "nytt-foretag"
  }
}
```

**Logik:**
- `create`: Upsert i `organizations`-tabellen med det ID som Hub bestammer (samma UUID i bada system)
- `update`: Uppdatera namn/slug
- Returnerar `{ success: true, organization_id: "..." }`

---

## Steg 2: Uppdatera `receive-user-sync`

**Nuvarande beteende:** Accepterar `organization_id` men faller tillbaka pa `LIMIT 1`.

**Nytt beteende:**
- Om `organization_id` saknas --> returnera `400 Bad Request` (krav pa explicit org-id)
- Validera att organisationen finns i `organizations`-tabellen
- Om den inte finns --> returnera `404` med tydligt felmeddelande: "Organization not found. Create it first via manage-organization."

---

## Steg 3: Uppdatera `verify-sso-token`

Samma andring som ovan:
- Krav pa `organization_id` i SSO-payload
- Validera mot `organizations`-tabellen
- Failar tydligt om org saknas

---

## Steg 4: Uppdatera alla webhook-Edge Functions

Foljande funktioner behover uppdateras for att **krava** `organization_id` i payload istallet for `LIMIT 1`-fallback:

| Edge Function | Nuvarande | Andring |
|---|---|---|
| `receive-booking` | Ingen org-hantering | Krava org_id i payload |
| `import-bookings` | `LIMIT 1` fallback | Krava org_id i payload |
| `receive-invoice` | `LIMIT 1` fallback | Krava org_id i payload |
| `staff-management` | `LIMIT 1` fallback | Krava org_id i payload |
| `mobile-app-api` | `LIMIT 1` fallback | Krava org_id i payload |
| `time-reports` | `LIMIT 1` fallback | Krava org_id i payload |
| `save-map-snapshot` | `LIMIT 1` fallback | Krava org_id i payload |

**Migreringsperiod:** Under en overgangsperiod kan vi behalla fallbacken men logga en varning, sa Hub hinner uppdateras.

---

## Steg 5: Regler for Hub

Hub maste folja denna ordning:

1. **Skapa organisation forst** via `manage-organization`
2. **Synka anvandare** via `receive-user-sync` med `organization_id`
3. **Skicka bokningar** via `receive-booking` / `import-bookings` med `organization_id`
4. **SSO-inloggning** via `verify-sso-token` med `organization_id` i payload

Organisation-ID:t ska vara **samma UUID** i bada systemen for att undvika mappning.

---

## Steg 6: RLS-policy for `organizations`

Tabellen har idag bara en SELECT-policy. Vi behover:
- **INSERT-policy** for service_role (via Edge Function) -- redan implicit med service_role
- Ingen INSERT/UPDATE for vanliga anvandare -- redan korrekt

Ingen databasandring behovs har, service_role gar forbi RLS.

---

## Sammanfattning av vad Hub behover gora

```text
1. POST /manage-organization   { action: "create", organization: { id, name, slug } }
2. POST /receive-user-sync     { email, password, roles, organization_id: "<fran steg 1>" }
3. POST /receive-booking       { booking_id, ..., organization_id: "<fran steg 1>" }
4. SSO payload                 { ..., organization_id: "<fran steg 1>" }
```

## Teknisk implementation

1. Skapa `supabase/functions/manage-organization/index.ts`
2. Redigera 7 befintliga Edge Functions for att krava `organization_id`
3. Ingen databasmigrering behovs (organizations-tabellen finns redan)
4. Lagg till overgangsperiod-loggning sa Hub kan uppdateras stegvis

