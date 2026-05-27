# Orderrad-todos: urval + dolda kalenderblock

## Mål
1. Vid "Planera hela bokningen" ska alla orderrader bli to-dos **by default**, men användaren ska kunna **bocka av enskilda rader** innan commit.
2. **Ta bort** den enskilda "+ To-do"-knappen per orderrad (skapas inte längre styckevis).
3. Orderrad-todos får **aldrig** bli egna block i projektkalendern. De **visas bara** när användaren klickar på bokningens kalenderblock.

## Ändringar

### 1. `BookingPlannerSheet.tsx` — urval per orderrad
- Ersätt checkboxen *"Alla orderrader som to-dos"* (rad 309–312) med ett räknat tillstånd, t.ex. "Skapa to-dos för X av Y orderrader".
- I orderrad-listan (rad 419–460):
  - Lägg till en `Checkbox` per rad, **förvald = på** för alla rader som inte redan har en länkad to-do (`linkedItems.length === 0`).
  - Rader som redan har to-do visas som disabled + grön "✓ Skapad"-badge istället för checkbox.
  - **Ta bort** `<Button>… To-do</Button>` per rad (rad 449–458).
- Lokalt state: `selectedProductIds: Set<string>`. Toggla per rad.
- "Markera alla / Avmarkera alla"-länk ovanför listan.
- Skicka `selectedProductIds` med i `onPlanWholeBooking(..., { …, productIdsForTodos })`.

### 2. `LargeProjectPlannerPanel.tsx` — respektera urvalet
- `handlePlanWholeBooking` (rad 219–251): byt ut blocket som hämtar **alla** `booking_products` mot att läsa endast de id:n som kom in via `selection.productIdsForTodos`.
- Behåll dedupe mot `existingForBooking` (befintliga to-dos per `booking_product_id`).
- Behåll övrig logik (multi-day phase commit via `savePhaseDays` är oförändrad).

### 3. Kalenderderivering — säkerställ att orderrad-todos aldrig blir block
- Verifiera i `src/services/plannerCalendarDerivation.ts` och `src/components/project/large-planner/useLargeProjectPlannerCalendarEvents.ts` att items där `item_type='task'` och/eller `booking_product_id != null` **inte** mappas till `CalendarEvent`. Idag derivas inga produkt-todos till kalendern — lägg till en explicit filter-rad + kommentar för att låsa beteendet:
  ```ts
  // Orderrad-todos (booking_product_id != null) renderas ALDRIG som egna
  // kalenderblock. De visas i bokningsblockets detalj-popover.
  ```

### 4. Visa orderrad-todos vid klick på bokningsblock i projektkalendern
- I `ProjectCalendarView` / det popover/sheet som öppnas vid klick på ett bokningsevent: lägg till sektion **"Orderrader / To-dos (N)"** som listar `large_project_booking_plan_items` med `booking_id === clickedBookingId && booking_product_id != null`.
- Kompakt rad: checkbox (status), titel, ev. tilldelad personal. Klick → öppnar samma redigerings-sheet som idag (`onItemClick`).
- Tomt-läge: "Inga orderrad-todos. Öppna planerings-sheeten för att skapa."

### 5. Ta bort den fristående "+ To-do"-knappen per rad även i `BookingProductsExpandable.tsx`
- Komponenten används från andra håll (icke-planner) — där tas knappen bort på samma sätt och ersätts med read-only visning av kopplade to-dos.

## Tester
- Uppdatera `BookingPlannerSheet`-relaterade tester (om finns) så att default-urval = alla rader, och att av-bockade rader inte ger to-do.
- Lägg regressionstest i `plannerCalendarDerivation.test` (eller skapa): 1 booking + 3 product-todos → exakt 1 bokningsevent, 0 todo-events.

## Inte i scope
- Ingen ändring i `savePhaseDays` / multi-day-skrivning.
- Ingen DB-migration (kolumner finns redan: `booking_product_id`, `item_type`).
- Ingen ändring i mobil-vyn.
