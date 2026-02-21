

# Hub-integration för multi-tenant organisationer

## Bakgrund

Systemet har nu full multi-tenant-isolation i databasen (RLS + triggers), men **Edge Functions är inte redo för flera organisationer**. Alla 10+ funktioner faller tillbaka på `SELECT id FROM organizations LIMIT 1` när ingen `organization_id` skickas.

Med bara 1 organisation ("Frans August") fungerar allt idag, men vid en andra organisation bryts det.

---

## Ansvarsfördelning

| System | Ansvar |
|---|---|
| **Hub** | Skapa/uppdatera organisationer, synka användare, SSO-inloggning |
| **Booking (EventFlow)** | Skicka bokningar med `organization_id` i payload |

Hub och EventFlow är separata system. Hub hanterar INTE bokningar.

---

## Steg 1: Ny Edge Function – `manage-organization` ✅

Endpoint som Hub anropar för att registrera organisationer.

**Endpoint:** `POST /functions/v1/manage-organization`
**Auth:** `x-api-key` (använder befintlig `WEBHOOK_SECRET`)

**Payload från Hub:**
```json
{
  "action": "create" | "update",
  "organization": {
    "id": "<uuid från Hub>",
    "name": "Nytt Företag AB",
    "slug": "nytt-foretag"
  }
}
```

**Status:** Implementerad och deployad.

---

## Steg 2: Uppdatera `receive-user-sync` ✅

- Kräver `organization_id` (med deprecation-varning vid fallback)
- Validerar att organisationen finns
- **Ansvarig avsändare: Hub**

**Status:** Implementerad.

---

## Steg 3: Uppdatera `verify-sso-token` ✅

- Kräver `organization_id` i SSO-payload
- Validerar mot `organizations`-tabellen
- **Ansvarig avsändare: Hub**

**Status:** Implementerad.

---

## Steg 4: Uppdatera booking-relaterade Edge Functions ✅

Dessa funktioner tar emot `organization_id` från **EventFlow/Booking** (inte Hub):

| Edge Function | Avsändare | Status |
|---|---|---|
| `receive-booking` | EventFlow | ✅ Klar |
| `import-bookings` | Internt (via receive-booking) | ✅ Klar |

---

## Steg 5: Uppdatera övriga webhook-Edge Functions ✅

Dessa funktioner har uppdaterats med deprecation-varning vid LIMIT 1 fallback:

| Edge Function | Status |
|---|---|
| `receive-invoice` | ✅ Klar |
| `staff-management` | ✅ Klar |
| `mobile-app-api` | ✅ Klar |
| `time-reports` | ✅ Klar |
| `save-map-snapshot` | ✅ Klar |

---

## Regler för Hub

Hub måste följa denna ordning:

1. **Skapa organisation först** via `manage-organization`
2. **Synka användare** via `receive-user-sync` med `organization_id`
3. **SSO-inloggning** via `verify-sso-token` med `organization_id` i payload

Organisation-ID:t ska vara **samma UUID** i båda systemen.

---

## Regler för EventFlow/Booking

EventFlow skickar bokningar med `organization_id`:

```json
POST /functions/v1/receive-booking
{
  "booking_id": "...",
  "event_type": "...",
  "organization_id": "<uuid>"
}
```

---

## Sammanfattning

```text
HUB:
1. POST /manage-organization   { action: "create", organization: { id, name, slug } }
2. POST /receive-user-sync     { email, password, roles, organization_id }
3. SSO payload                 { ..., organization_id }

EVENTFLOW/BOOKING:
4. POST /receive-booking       { booking_id, event_type, organization_id }
```

## Teknisk status

- ✅ `manage-organization` skapad och deployad
- ✅ 9 Edge Functions uppdaterade med organization_id-stöd
- ✅ Övergångsperiod med LIMIT 1 fallback + deprecation-varningar
- ✅ Ingen databasmigrering behövdes
