

# Audit: organization_id-isolering i alla Edge Functions

## Sammanfattning

Jag har granskat samtliga 26 edge functions. Flera kritiska brister har identifierats där `service_role`-nyckeln används (som kringgår RLS) utan att filtrera på `organization_id`. Detta innebär att data kan läcka mellan organisationer.

## Identifierade problem

### KRITISK 1: `mobile-app-api` — Bugg + saknar org-filtrering

**Bugg (rad 65-67):** `body` refereras INNAN `await req.json()` körs — `body` är `undefined` vid anropet till `resolveOrganizationId`. Detta kraschar funktionen.

```text
Rad 65: const organizationId = await resolveOrganizationId(supabase, body?.organization_id)  // body = undefined!
Rad 67: const body = await req.json()  // body deklareras EFTER användning
```

**Saknar org-filtrering på alla queries:** Funktionen använder `service_role` (kringgår RLS). Inga SELECT-anrop filtrerar på `organization_id`:
- `handleGetBookings()` — returnerar bokningar från ALLA organisationer
- `handleGetTimeReports()` — returnerar tidrapporter från ALLA organisationer
- `handleMe()` / `handleLogin()` — returnerar personal från ALLA organisationer
- `handleGetProject()`, `handleGetProjectComments()`, `handleGetProjectFiles()`, `handleGetProjectPurchases()` — returnerar projektdata från ALLA organisationer

**Åtgärd:** Flytta `body`-parsning före `resolveOrganizationId`. Lägg till `.eq('organization_id', organizationId)` på samtliga queries. Alternativt: koppla staff_member till en org vid login och filtrera all data via den relationen.

### KRITISK 2: `staff-management` — Resolvar org men filtrerar aldrig

Funktionen resolvar `organizationId` (rad 77-91) men skickar det **aldrig** vidare till någon query:
- `getStaffMembers()` — `select('*')` utan org-filter
- `getStaffAssignments()` — ingen org-filter
- `getAvailableStaff()` — ingen org-filter
- `getStaffCalendarEvents()` — ingen org-filter
- `assignStaffToTeam()` / `removeStaffAssignment()` — ingen org-filter
- `createStaffMember()` — saknar `organization_id` i insert

**Åtgärd:** Skicka `organizationId` som parameter till alla handler-funktioner och lägg till `.eq('organization_id', organizationId)` på alla queries samt `organization_id: organizationId` på alla inserts.

### KRITISK 3: `time-reports` — Inga org-filter på GET

Funktionen använder `service_role` globalt. GET-anrop returnerar data från alla organisationer:
- `GET /time-reports` (rad 42-68) — ingen org-filter
- `GET /time-reports/summary` (rad 72-170) — ingen org-filter
- `PUT /time-reports/{id}` (rad 206-233) — ingen org-filter (kan uppdatera annan orgs data)
- `DELETE /time-reports/{id}` (rad 235-255) — ingen org-filter (kan radera annan orgs data)

**Åtgärd:** Resolva org från request (header/body/auth) och filtrera alla queries med `.eq('organization_id', orgId)`.

### KRITISK 4: `import-bookings` — Warehouse events saknar organization_id

Funktionen `syncWarehouseEventsForBooking()` (rad 205-351) bygger en events-array men inkluderar **inte** `organization_id` i objekten. Vid upsert med `service_role` sätts inget org_id automatiskt (RLS-default `get_user_organization_id(auth.uid())` returnerar null för service_role).

**Åtgärd:** Lägg till `organization_id: orgId` i varje event-objekt i arrayen.

### MEDIUM 5: `receive-booking` — org_id bör vara obligatoriskt

Funktionen loggar en varning om `organization_id` saknas men fortsätter ändå (rad 38-40). Om Hub glömmer skicka org_id faller `import-bookings` tillbaka till "first org" — korrekt idag med en org, men farligt vid multi-tenant.

**Åtgärd:** Returnera 400 om `organization_id` saknas istället för att bara varna.

### MEDIUM 6: Alla "fallback to first org"-mönster

Följande funktioner har fallback till första organisationen om org_id saknas:
- `import-bookings` (rad 23-24)
- `mobile-app-api` (rad 46)
- `time-reports` (rad 16-17)
- `staff-management` (rad 88-89)
- `verify-sso-token` (rad 133-134)
- `receive-user-sync` (rad 207-208)

**Åtgärd (framtida):** Konvertera alla till strikta krav — returnera 400 istället för fallback. Kan göras i en senare fas.

## Funktioner som redan är korrekta

| Funktion | Status |
|---|---|
| `manage-organization` | OK — hanterar org CRUD korrekt |
| `receive-user-sync` | OK — validerar org, synkar roller med org_id |
| `verify-sso-token` | OK — resolvar och validerar org |
| `planning-api-proxy` | OK — proxar till extern, JWT-validerad, ingen lokal data |
| `fetch-tracked-time` | OK — proxar till extern, ingen lokal data |
| `receive-booking` | Delvis OK — vidarebefordrar org men bör kräva det |

## Åtgärdsplan (prioritetsordning)

### Steg 1: mobile-app-api (kritisk bugg + läckage)
- Fixa body-parsningsordningen
- Resolva org_id från staff_members organization_id (via login)
- Filtrera ALLA queries med org_id

### Steg 2: staff-management (läckage)
- Skicka organizationId till alla handler-funktioner
- Lägg till `.eq('organization_id', organizationId)` på alla queries
- Lägg till `organization_id` på alla inserts

### Steg 3: time-reports (läckage)
- Resolva org_id från request
- Filtrera alla queries med org_id
- Skydda PUT/DELETE med org-filter

### Steg 4: import-bookings warehouse events (saknat fält)
- Lägg till `organization_id: orgId` i warehouse events array

### Steg 5: receive-booking (striktare validering)
- Gör organization_id obligatoriskt (returnera 400 om saknas)

---

Ska jag implementera alla steg i en omgång, eller vill du att jag börjar med de kritiska (steg 1-4)?

