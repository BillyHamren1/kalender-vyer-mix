# Scanner read contract v1 — Planning-sidan

Status: **kodnivå, inte live.** Inget här är aktivt förrän `scanner-api` har fått
separat godkänd deployment och autentiserad E2E-verifiering.

## Aktivering

`list_active_packings` lägger till bevisblocket ENDAST när anropet skickar
`params.includeScannerContractV1 === true`. Utan flaggan är svarsformen och det
externa anropsmönstret exakt oförändrat (noll extra WMS-anrop).

Varje versionerat svar från både `mobile-app-auth` och `scanner-api` ekar
`x-eventflow-scanner-contract: scanner_contract_v1`. Scanner avvisar svar som
saknar huvudet eller annonserar en annan version. Därmed kan en äldre live
Edge Function inte tyst behandlas som den verifierade kontraktsversionen.

## Kontrakt (per packning)

```jsonc
{
  "wms_reservation_id": "…|null",        // endast från lyckad WMS-resolution
  "scanner_contract_v1": {
    "contract_version": "scanner_contract_v1",
    "booking": {
      "booking_id": "canonical id, aldrig lokalt Planning-id",
      "source_status": "…|null",
      "source_revision": 0,               // icke-negativt heltal, annars null
      "source_updated_at": "ISO|null"
    },
    "planning": {
      "calendar_events": [{
        "event_id": "calendar_events.id exakt",
        "booking_id": "canonical booking_id (måste matcha packningens)",
        "organization_id": "tenant (måste matcha anropets ORG_ID)",
        "job_id": "packing_projects.id (endast lokal Scanner-jobbidentitet)",
        "phase": "rigg|event|riggner",
        "starts_at": "RFC3339-instant med offset",
        "ends_at": "RFC3339-instant med offset, >= starts_at",
        "updated_at": null,
        "time_zone": "Europe/Stockholm",
        "all_day": false,
        "revision": null
      }]
    },
    "wms": {
      "reservation_id": "…|null",
      "raw_status": "…|null",             // aldrig tolkat till is_released/is_active
      "updated_at": "RFC3339|null",
      "synced_at": "RFC3339|null",
      "resolution_code": "typed failure|null"
    }
  }
}
```

## Källregler

- Booking-bevis kommer **enbart** från `bookings.last_applied_source_revision`.
  Aldrig `packing.status`, `packing.updated_at` eller `bookings.updated_at`.
- Kalenderbevis läses batchat från `calendar_events`, alltid `organization_id`-scopat.
  Endast `rig|rigg → rigg`, `event → event`, `rigDown|rigdown|rig_down|riggner → riggner`
  mappas; andra typer ignoreras.
- **Strikta kalenderregler.** En rad tas endast med när event_id, booking_id,
  organization_id och job_id är icke-tomma strängar, radens booking_id och
  organization_id är exakt de förväntade, `starts_at`/`ends_at` är fullständiga
  RFC3339-instants med explicit `Z` eller numerisk offset (sekunder/fraktion
  valfria) och `ends_at >= starts_at`. Datum utan tid, lokal tid utan offset och
  omöjliga datum/tider avvisas. Rader som inte uppfyller detta **utelämnas** —
  Scanner fail-closar då på saknat kalenderbevis. Inget kanoniskt event får ha
  null-identitet eller null-tider.

- WMS-bevis kommer enbart från ett lyckat `get-reservation`-svar via befintlig
  `resolveWmsReservation`, med max 6 samtidiga resolutioner.
- Saknad/ogiltig upstreamdata → `null` eller typed kod. Aldrig gissning, aldrig `success: true`.
- Databasfel i opt-in-flödet fail-closar med `scanner_contract_booking_read_failed`
  respektive `scanner_contract_calendar_read_failed` (HTTP 502) och läcker inga secrets.

## Kända blockerare

- Scanner-trafik kräver signerad `efs2`-credential, exakt kontraktshuvud och
  `SCANNER_ALLOWED_ORIGINS` utan wildcard. `verify_jwt = false` är explicit
  eftersom gränsen verifierar den separata, kortlivade Scanner-credentialen;
  det är inte ett undantag från autentisering. Planning-mobilens legacytrafik
  är fortsatt separat under övergången.
- **Mutation receipt / idempotency saknas** — kontraktet är läsning enbart.
- `calendar_events` saknar `updated_at` i schemat; fältet är därför alltid `null`
  och får inte fabriceras från `created_at`.
- Kalenderrevision saknas i källan → `revision: null`.

## Read-pilot: deployförberedelse

Kör `npm run scanner:deploy-preflight` i den granskade deploymiljön. Grinden
skriver bara nyckelnamn och status, aldrig värden. Den kräver:

- Planning-ref `pihrhltinhewhoxefjxv` och Bundle/WMS-ref
  `pnvvnvywphfvmwdmqqzs`;
- separat `SCANNER_TOKEN_SIGNING_SECRET` på minst 32 byte;
- exakt `SCANNER_APP_URL` i `SCANNER_ALLOWED_ORIGINS`, utan wildcard;
- separat server-side `PRICELIST_API_KEY` för read-only Bundle/WMS-anrop;
- `SCANNER_RELEASE_MODE=read_only`;
- `SCANNER_RELEASE_SHA` exakt lika med verifierad, utcheckad Git-commit;
- exakt `SCANNER_DEPLOY_FUNCTIONS=scanner-api,mobile-app-auth` i denna ordning;
- båda funktionspaketen och deras delade kontraktsmoduler.

Releasemanifestet är
`supabase/scanner-read-pilot-release-v1.json`. Det förbjuder migrationer,
fysiska mutationer och deployment av `scanner-operation-v2`. Scanner-token
innehåller samma release-SHA som API:t verifierar. Delvis deployment eller en
gammal token blockeras därför med `release_mismatch`. API:t driftsätts före
credential-utgivaren så att mellanläget blir stängt. Kör aldrig ett
generellt ”deploy all functions” för read-piloten. Den äldre mutationsfunktionen
finns kvar för legacy/rollback men ingår inte i detta releasepaket.

Efter uttryckligt godkännande driftsätts `scanner-api` och `mobile-app-auth`
från **samma verifierade commit**. En autentiserad smoke-E2E måste därefter
bevisa login, framtida jobb, kanoniska ID:n, blockerade mutationer och logout.
Detta är fortfarande inte en fysisk pilot eller ett TC22/RFD4030-bevis.
