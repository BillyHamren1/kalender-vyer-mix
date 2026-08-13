# Runbook: Booking → Planning sync (incidenthantering)

Intern teknisk runbook. **Ingen instruktion här massändrar produktionsdata.**
Allt nedan är antingen read-only diagnostik eller en paus/återstart av sync.

> Grundregel vid misstänkt syncproblem: **pausa först, undersök sedan.**
> Ingen automatik får "reparera" bokningar. Massoperationer är förbjudna.

---

## 1. Stoppa normal (muterande) sync

Kill switchen är **server-side env-flaggor** på Edge Functions. En request kan
aldrig slå av eller på dem.

| Flagga | Effekt |
| --- | --- |
| `NORMAL_MUTATING_SYNC_PAUSED=true` | Pausar all muterande Booking→Planning-sync för **alla** organisationer |
| `NORMAL_MUTATING_SYNC_PAUSED_ORGS=<org-uuid>[,<org-uuid>]` | Pausar endast angivna organisationer |

Default (flaggan saknas) = sync körs som vanligt, oförändrat beteende.

Gör så här:
1. Supabase Dashboard → Edge Functions → Secrets.
2. Sätt `NORMAL_MUTATING_SYNC_PAUSED` till `true` (endast exakt strängen `true` pausar).
3. Verifiera i loggarna att `[sync_block_audit]` börjar dyka upp med
   `reason: "mutating_sync_paused"`.

Vid paus gäller:
- 0 mutationer
- cursorn (`sync_state.last_sync_timestamp`) står still
- inga sync-jobb blir `completed` (de ligger kvar för retry)
- ingen revision committas
- dry-run / read-only diagnostik fungerar fortfarande

---

## 2. Verifiera cancellation-flaggan

Automatisk cancellation är avstängd som standard och styrs av
`_shared/destructiveSyncFlag.ts`. Kontrollera:

1. Edge Function Secrets: bekräfta att ingen destructive-enable-flagga är satt.
2. Sök i loggarna efter `automatic_destructive_sync_disabled` och
   `cancellation_requires_explicit_apply` — det är förväntat beteende, inte fel.
3. Read-only kontroll av kandidater i DB:

```sql
select booking_id, source_status, last_applied_source_revision, updated_at
from booking_source_state
where organization_id = '<org-uuid>'
  and source_status ilike '%cancel%'
order by updated_at desc
limit 50;
```

Ser du fler än en handfull kandidater i samma körning → **behandla som incident**,
låt pausen ligga kvar och eskalera. Applicera aldrig cancellation i batch.

---

## 3. Kör dry-run för EN bokning

Diagnostiskt verktyg, 0 mutationer, fungerar även när sync är pausad.

```
POST /functions/v1/booking-repair-dry-run
Authorization: Bearer <admin-användarens JWT>
{ "organization_id": "<org-uuid>", "booking_id": "<booking-id>", "dry_run": true }
```

- Kräver admin-roll i samma organisation (annars 403).
- Batch, wildcard, `booking_ids`, `apply`, `confirm`, `since`, `limit` → 400 fail-closed.
- Svaret visar `booking_fields`, `products`, `calendar`, `projections`, `revision`,
  `planning_owned_state`, `wms_owned_state`, `warnings`.
- `remove_candidate` är **enbart diagnostik** — inget raderas.

---

## 4. Kontrollera batch och cursor

```sql
-- Cursorn per organisation
select organization_id, sync_type, last_sync_status, last_sync_mode,
       last_sync_timestamp, updated_at
from sync_state
where sync_type = 'booking_import'
order by updated_at desc;

-- Aktiva/nyliga batcher
select id, organization_id, status, total, succeeded, failed,
       cursor_advanced_to, created_at, updated_at
from sync_batches
order by created_at desc
limit 20;

-- Jobbstatus
select status, count(*)
from booking_sync_jobs
where organization_id = '<org-uuid>'
group by status;
```

Checklista:
- Cursorn får **aldrig** ha flyttats i en körning som misslyckats eller pausats.
- En batch får bara `cursor_advanced_to` när `failed = 0`.
- Växande `pending`-kö under paus är förväntat.

---

## 5. Identifiera lease-konflikt

Två workers som tävlar om samma bokning:

```sql
select id, booking_id, organization_id, status, attempts,
       locked_by, locked_at, lease_expires_at, next_attempt_at, last_error
from booking_sync_jobs
where organization_id = '<org-uuid>'
  and status in ('processing', 'pending')
order by locked_at desc nulls last
limit 50;
```

Signaler:
- Loggrader med `lease_lost` eller `lease_losses > 0` i `[sync_ops_metrics]`.
- Samma `booking_id` med snabbt växande `attempts`
  → anomalin `repeated_retry_same_booking`.
- `lease_expires_at` i det förflutna medan `status = 'processing'`
  → föräldrad lease; den tas över av nästa worker automatiskt. Rör inte raden manuellt.

Åtgärd: pausa sync, låt leasen löpa ut, undersök. Uppdatera aldrig jobbrader för hand.

---

## 6. Anomaliflaggor att leta efter i loggen

Loggnamn: `[sync_ops_metrics]` (per org) och `[sync_ops_anomaly]`.

| Flagga | Betyder |
| --- | --- |
| `high_failure_rate` | ≥30 % failed/partial (minst 5 importer) |
| `many_product_delete_candidates` | ≥25 produkt-raderingskandidater |
| `many_calendar_delete_candidates` | ≥10 kalender-raderingskandidater |
| `repeated_retry_same_booking` | Samma bokning ≥3 försök |
| `revision_went_backwards` | Källrevisionen gick bakåt |
| `sudden_source_count_drop` | Källantalet halverat mot föregående körning |

Alla anomalier är **endast detektering** — inget pausas automatiskt.
Vid flagga: pausa manuellt enligt avsnitt 1.

---

## 7. Blockeringsaudit

Varje blockering loggas som `[sync_block_audit]` med:
`organization_id`, `booking_id`, `reason`, `scope`, `job_id`, `batch_id`,
`source_revision`, `applied_revision`, `caller`, samt
`mutations: 0`, `cursor_moved: false`, `job_completed: false`.

Tokens, nycklar och secrets filtreras bort och loggas aldrig.

---

## 8. Återstarta efter verifiering

Först när samtliga punkter stämmer:

1. Dry-run på minst en representativ bokning ser korrekt ut (avsnitt 3).
2. Inga öppna anomaliflaggor för organisationen (avsnitt 6).
3. Cursorn står på ett värde du förstår och kan förklara (avsnitt 4).
4. Inga föräldrade leases i `processing` (avsnitt 5).
5. Cancellation-flaggan är fortsatt avstängd (avsnitt 2).

Därefter:
- Ta bort `NORMAL_MUTATING_SYNC_PAUSED` (eller sätt den till `false`), alternativt
  ta bort org-uuid:t ur `NORMAL_MUTATING_SYNC_PAUSED_ORGS`.
- Kör **en** single-booking-sync och verifiera `outcome: "applied"` eller
  `"already_current"` innan kön öppnas brett.
- Följ `[sync_ops_metrics]` under de första körningarna.

Om något ser fel ut: pausa igen direkt. Att stå still är alltid säkrare än att
skriva fel data.
