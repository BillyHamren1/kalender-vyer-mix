Jag har hittat var detta kommer ifrån och planen är att ta bort det ordentligt.

## Vad som faktiskt händer
Det här är inte "produkter i lagerprojektet" i egentlig mening. Det är en separat loggfunktion som skapades nyligen:

- `warehouse_project_changes` skapades i migrationen `20260417081726_...`
- Där skapades också triggern `track_warehouse_product_changes_trg` på `booking_products`
- Varje gång produkter på en bokning ändras skriver triggern rader till `warehouse_project_changes`
- `WarehouseProjectInbox` renderar dessutom alltid `WarehouseProjectChanges`, så loggen visas direkt på lagerdashboarden
- `import-bookings` gör på flera ställen delete/reinsert av `booking_products`, vilket gör att triggern tolkar synk som "produkt borttagen / produkt tillagd" om och om igen

Det är alltså en pålagd ändringslogg ovanpå bokningsprodukterna, inte en riktig del av lagerprojektets arbetsflöde.

## Plan
1. Ta bort ändringsloggen från lager-UI
- Ta bort `WarehouseProjectChanges` från dashboard/inbox
- Ta bort fliken `Ändringar` i `WarehouseProjectDetail`
- Ta bort notifieringsräkning från `useWarehouseNotificationCount` så dessa loggrader inte längre påverkar badges

2. Stäng av källan som skapar raderna
- Skapa en migration som droppar triggern `track_warehouse_product_changes_trg`
- Droppa även datum-triggern `track_warehouse_date_changes_trg`
- Lämna inte fortsatt skrivning till `warehouse_project_changes`

3. Rensa bort det som redan skapats
- Radera befintliga rader i `warehouse_project_changes` så dashboarden blir ren direkt
- Om du hellre vill spara historiken kan jag istället bara gömma funktionen och markera allt som hanterat, men utifrån det du skriver är rätt väg att tömma tabellen

4. Stabiliseringsfix
- Ta bort den återstående React-varningen med dublettnyckeln `unknown` genom att inte längre rendera den här listan, och vid behov säkra keys där fallback idag är `unknown`

## Teknisk detalj
Berörda filer/tabeller:
- `supabase/migrations/20260417081726_5b87f4cb-3b15-40b3-9ff6-da56edc3bbd5.sql`
- `supabase/migrations/20260421113141_a3cdbddb-9afc-4c08-b0ab-91a945e8405f.sql`
- `supabase/migrations/20260421113831_f18b52ae-d776-4ff4-91bd-7044d54ebdee.sql`
- `src/components/warehouse/WarehouseProjectInbox.tsx`
- `src/components/warehouse/WarehouseProjectChanges.tsx`
- `src/components/warehouse/WarehouseProjectChangesTab.tsx`
- `src/services/warehouseProjectChangesService.ts`
- `src/hooks/useWarehouseNotificationCount.ts`

När du godkänner detta genomför jag borttagningen så lagerprojekt inte längre visar eller sparar dessa "ändringar".