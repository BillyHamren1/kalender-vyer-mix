## Vad som faktiskt händer

För Bergman Event AB / booking #2603-126:

1. **17 april** — Projektet konverterades första gången. Det skapade `warehouse_projects.Lager-2603-126` (men `source_project_id` sattes inte i den raden).
2. **27 april (idag)** — Projektet i Planning raderades och importerades om från externa bookingsystemet. Det skapade ett **nytt** `projects`-id (`1c2c01d4…`).
3. Triggern `trg_notify_warehouse_on_new_project` fyrar på `AFTER INSERT ON projects` och la in en helt ny rad i `warehouse_project_inbox` — utan att kolla om underlaget (samma `booking_number` 2603-126) redan har ett aktivt `warehouse_projects`.
4. När du klickar "Skapa lagerprojekt" försöker den skapa `Lager-2603-126` igen → unique constraint krockar → "Okänt fel".

Så ja — du har helt rätt. Det är inte ett "nytt projekt", det är samma underliggande booking som dök upp på nytt i Planning, men inbox-logiken förstår inte det.

## Vad planen åtgärdar

### 1. Inbox-triggern blir smartare (DB)

`notify_warehouse_on_new_project` och `notify_warehouse_on_new_large_project` ska inte blint inserta en `new`-rad. Innan insert:

- Slå upp om det redan finns ett `warehouse_projects` för samma `organization_id` + `source_project_number` (för booking-baserade projekt) eller samma underliggande booking-set.
- Om JA: skippa inbox-insert helt (eller skapa en `status='already_linked'`-rad som inte visas i listan), och länka det nya `projects.id` till det befintliga `warehouse_projects.source_project_id` så framtida lookups funkar.
- Om NEJ: insert som vanligt.

### 2. Backfill av source_project_id

En migration som fyller i `source_project_id` på existerande `warehouse_projects` genom att matcha på `source_project_number` mot nuvarande `projects.booking_id → bookings.booking_number`. Detta läker existerande "föräldralösa" warehouse-projekt så regeln i punkt 1 kan hitta dem.

### 3. Frontend: hantera "redan konverterad" elegant

I `createWarehouseProjectFromInbox`:
- Innan insert: kolla om `warehouse_projects` redan finns för denna `organization_id` + `source_project_number`.
- Om JA: länka inbox-raden till det existerande projektet (`warehouse_project_id` + `status='processed'`), visa toast _"Lagerprojektet finns redan — öppnar det"_, och navigera till det befintliga.
- Om NEJ: kör som vanligt.

### 4. Städa Bergman-fallet manuellt

Två konkreta åtgärder via insert-tool:
- Sätt `warehouse_projects.source_project_id = '1c2c01d4-e9e5-4c82-9b95-88461092219f'` på Lager-2603-126.
- Markera den nya inbox-raden (`51f7b85a…`) som `status='processed'` med `warehouse_project_id` pekande på den befintliga `Lager-2603-126`, så du slipper Okänt-fel-knappen direkt.

### 5. (Valfritt) "Uppdaterad"-notis

Om du vill ha en explicit visuell signal när ett underliggande projekt har ändrats efter konvertering: lägg till en separat liten notis-sektion ("Projekt uppdaterade i Planning") som listar inbox-rader med `status='already_linked'`, så du ser att något hänt utan att det blockar dig med duplikat-skapning. Säg till om du vill ha den biten — annars hoppar vi den.

## Tekniska filer som ändras

- `supabase/migrations/<ny>.sql` — uppdatera båda `notify_warehouse_on_new_*`-triggerfunktioner + backfill av `source_project_id` + datapatch för Bergman-fallet.
- `src/services/warehouseProjectService.ts` — `createWarehouseProjectFromInbox` får en pre-flight lookup mot existerande `warehouse_projects`.
- (Ev.) `src/components/warehouse/WarehouseProjectInbox.tsx` — toast/redirect när det redan finns.

## Vad jag INTE rör

- `generate_warehouse_project_number`-triggern. Den är bara symptomet — när vi väl slutar försöka skapa duplikat behöver den inte härdas. Säg till om du vill att vi ändå lägger på collision-suffix som säkerhetsnät.

Säg till om jag ska köra punkt 1–4. Punkt 5 frågar jag om separat.