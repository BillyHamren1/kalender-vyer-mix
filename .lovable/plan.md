## Mål

När du planerar inuti ett stort projekt ska:
1. **Tid/datum synkas tillbaka till underliggande bokning** — bokningens egen vy visar vad som planerats inuti det stora projektet (personalkalendern fortsätter använda det stora projektets tider).
2. **Alla orderrader för bokningen synas** när du planerar.
3. **Varje orderrad kunna klickas → skapa to-do** (planner item) för just den raden. Manuell to-do finns kvar.

## Vad jag bygger

### 1. DB-koppling: planner item ↔ orderrad
- Migration: lägg till `booking_product_id uuid NULL` på `large_project_booking_plan_items` (FK till `booking_products.id`, ON DELETE SET NULL) + index.
- Inga RLS-ändringar (ärver från befintlig tabell).

### 2. Sync planner → bokning (booking mirror)
- Ny tabell `booking_internal_plan_items` (eller vy) som speglar planner items per bokning.
  - Enklare alternativ: **ingen ny tabell** — bokningsvyn läser direkt `large_project_booking_plan_items WHERE booking_id = …`. Det är redan en spegel; ingen extra synk behövs.
- Vald väg: **ingen extra tabell**. Bokningsvyn (sub-booking-detalj) får en ny sektion "Planering inuti stora projektet" som listar plan-items för den bokningen, med tid, datum, personal, status, kopplad orderrad.
- Personalkalendern rörs INTE — den fortsätter använda `calendar_events` + LP-team (Large Project Team Source of Truth-policyn intakt).

### 3. UI: orderrader i planner-panelen
- I `LargeProjectPlannerPanel` (kortet per bokning): expanderbar lista med bokningens `booking_products` (namn, antal, ev. parent-group).
- Hook `useBookingProductsForPlanner(bookingId)` med React Query.
- Varje rad har en `+ To-do`-knapp som öppnar `ManualProjectTaskDialog` förifylld med:
  - `defaultTitle` = produktnamn
  - `defaultBookingId` = bokningens id
  - `defaultBookingProductId` = orderradens id
  - datum/tid = bokningens event-datum/tid (samma fallback som idag)

### 4. ManualProjectTaskDialog
- Lägg till `defaultBookingProductId` prop + dolt fält som skickas in i `createPlanItem`-payload.
- `largeProjectPlannerService.createItem` får ta emot `booking_product_id` och skriva till nya kolumnen.

### 5. Bokningsvy
- Hitta sub-booking-detaljkomponenten (sannolikt `BookingDetailPage` eller motsv.). Lägg in `<LargeProjectBookingPlanMirror bookingId={…} />` ovanför orderrad-sektionen.
- Komponenten läser plan-items för bokningen, grupperar per datum, visar tid + titel + personal + ev. orderrad-koppling.

### 6. Tester (Vitest)
- `largeProjectPlannerService.createItem` skriver `booking_product_id` korrekt.
- Hook `useBookingProductsForPlanner` returnerar rader för en bokning.
- Render-test: `LargeProjectPlannerPanel` visar orderrader när bokningskortet expanderas och `+ To-do`-knappen öppnar dialogen förifylld.

## Tekniska detaljer

### Migration
```sql
ALTER TABLE public.large_project_booking_plan_items
  ADD COLUMN booking_product_id uuid NULL
    REFERENCES public.booking_products(id) ON DELETE SET NULL;

CREATE INDEX idx_lp_plan_items_booking_product
  ON public.large_project_booking_plan_items(booking_product_id)
  WHERE booking_product_id IS NOT NULL;
```

### Filer som ändras / skapas
- ny: `supabase/migrations/<ts>_lp_plan_item_booking_product.sql`
- ny: `src/hooks/useBookingProductsForPlanner.ts`
- ny: `src/components/project/large-planner/BookingProductsExpandable.tsx`
- ny: `src/components/project/LargeProjectBookingPlanMirror.tsx`
- ny: `src/components/project/large-planner/__tests__/createItemWithProduct.test.ts`
- redigeras:
  - `largeProjectPlannerTypes.ts` (lägg till `booking_product_id` i typer)
  - `largeProjectPlannerService.ts` (skriv/läs `booking_product_id`)
  - `ManualProjectTaskDialog.tsx` (defaultBookingProductId + visa kopplad rad)
  - `LargeProjectPlannerPanel.tsx` (montera `BookingProductsExpandable`, propagera till dialog)
  - Sub-booking-detaljsidan (montera `LargeProjectBookingPlanMirror`)

## Vad jag INTE rör
- `calendar_events` / personalkalenderns team — fortsätter följa Large Project Team Source of Truth.
- Ingen autoskrivning av bokningens `event_start_time`/`event_end_time` (det är fortfarande LP-tider).
- Ingen ny anslagstavla/notes-tabell (One Bulletin Board).

## Frågor jag behöver innan jag kör

1. **Bokningsvy**: ska "Planering inuti stora projektet"-sektionen visas på sub-booking-detaljsidan (det vanliga bokningskortet i Planering) eller på en annan vy?
2. **Orderradens to-do**: ska todo-titeln auto-bli `<produktnamn> · #<bokningsnr>` eller bara produktnamnet?
3. När man redigerar/flyttar en plan-item-tid — räcker det att den syns uppdaterad i bokningsvyn (samma rad, ingen ytterligare synk), eller vill du att något fält på själva bokningen också skrivs?
