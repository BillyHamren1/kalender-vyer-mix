## Problem

Bokning **2602-13** har uppdaterade produkter i Booking (t.ex. pris, anteckningar, moms), men Planning visar fortfarande gamla värden — trots att sync-jobben körs och `booking_sync_jobs` visar `completed` var 2–3 minut.

## Rotorsak (verifierad i koden)

`checkProductChanges()` i `supabase/functions/import-bookings/index.ts` (rad 1601–1679) jämför **endast namn och antal** mellan externa och lokala produkter:

```ts
} else if (existing.quantity !== (extProduct.quantity || 1)) {
  updated.push(...)
}
```

Om Booking uppdaterar `unit_price`, `total_price`, `notes`, `sku`, `vat_rate`, `discount` eller `tags` på en befintlig produktrad (utan att ändra namn eller antal), returnerar funktionen `changed: false`.

Då blir `needsProductUpdate = false`, och i huvudloopen (rad 3058 + 3685):

```ts
if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && !needsProductRecovery && !needsProductUpdate) {
  continue; // SKIP UPDATE - NO CHANGES
}
...
if (needsProductUpdate || !existingBooking) { ... upsert products ... }
```

→ Hela produkt-upserten hoppas över. Produkterna i Planning fryses tills någon ändrar namn eller antal.

Bokning 2602-13 har 42 lokala produkter, senast uppdaterade 08:15 idag. Sync-jobben efter det har alla completat utan att röra produkterna — vilket stämmer exakt med denna bugg.

## Fix (minimal, kirurgisk)

Utöka `checkProductChanges()` att också detektera diff i:

- `unit_price` (numerisk jämförelse, 2 decimaler)
- `total_price` (numerisk jämförelse)
- `notes` (trimmad string-jämförelse)
- `sku`
- `vat_rate`
- `discount`
- `tags` (sorterad array-signatur)

När någon av dessa skiljer sig → `changed = true` → huvudflödet triggar in-place `UPDATE` av `booking_products` (samma merge-strategi som finns idag, ingen ny skrivväg).

## Ändringar

### 1. `supabase/functions/import-bookings/index.ts`
- Utöka `SELECT` i `checkProductChanges` till `id, name, quantity, unit_price, total_price, notes, sku, vat_rate, discount, tags`.
- Lägg till fältvisa diffs i loopen som bygger `updated`-listan (utan att röra existerande guard mot tom extern payload).
- Ingen förändring i själva skriv-vägen (rad 3682–3900) — den räknar redan om alla fält när `needsProductUpdate = true`.

### 2. Contract test
Nytt test `supabase/functions/import-bookings/checkProductChanges.contract.test.ts` som verifierar:
- Endast pris ändrat → `changed: true`
- Endast notes ändrat → `changed: true`
- Endast vat_rate ändrat → `changed: true`
- Identiska produkter → `changed: false`
- Tom extern payload med lokala produkter → `changed: false` (befintlig guard bibehålls)

### 3. Manuellt tvångs-sync av 2602-13
Efter deploy: anropa `import-bookings` med `booking_id: '2602-13'`, `syncMode: 'single'` för att omedelbart backfilla den drabbade bokningen.

## Ej i scope

- Ingen ändring i sync-cursor, batch- eller job-logik.
- Inga schemaändringar.
- Ingen förändring i hur produkter skrivs (samma merge/insert/delete-flöde).
- Inga andra bokningar rörs automatiskt — nästa periodiska sync plockar upp dem naturligt när fixen är live.
