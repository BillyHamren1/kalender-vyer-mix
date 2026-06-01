## Problem
För aggressiv filtrering tar bort tillbehör (rader med `parent_product_id` men `is_package_component=false`) från Planera-sheet och to-do-listan. Bara faktiska paketmedlemmar (`is_package_component=true`) ska bort.

## Ändringar

**1. `src/hooks/useBookingProductsForPlanner.ts`**
Ändra filtret från:
```ts
rows.filter((p) => !p.is_package_component && !p.parent_product_id)
```
till:
```ts
rows.filter((p) => !p.is_package_component)
```

**2. `src/components/booking/detail/BookingTodosChecklist.tsx`**
`isPackageMember`-helpern kollar idag både `is_package_component` och `parent_product_id`. Ändra till att enbart returnera `is_package_component === true`. Samma helper styr både den visuella filtreringen, auto-rensningen av stale todos och `productsWithoutTodo` — så tillbehör kommer återigen kunna bli to-dos och visas i "Orderrader utan to-do".

## Risk
Auto-delete-effekten i `BookingTodosChecklist` har redan rensat ev. tillbehörs-todos en gång (under det gamla filtret). De återskapas inte automatiskt — användaren kan markera tillbehör i Planera-sheet igen för att skapa nya to-dos.

Inga DB-migrationer, inga ändringar i kalenderlogik eller paketlogik utöver detta.