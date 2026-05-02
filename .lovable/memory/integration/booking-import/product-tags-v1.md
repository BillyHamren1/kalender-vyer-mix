---
name: Product Tags Import
description: Booking-API skickar tags + tags_en på varje produkt; import-bookings måste alltid mappa båda fälten till booking_products
type: feature
---
Booking-API:t (export_bookings) returnerar `tags: string[]` och `tags_en: string[]` på varje produkt i `booking.products[]`. Båda fälten är text[]-kolumner på `booking_products` med GIN-index.

**Krav på `import-bookings`:** Båda product-insert-paths (recovery-loop ~rad 2951 och huvud-merge ~rad 3495) MÅSTE alltid sätta:
```ts
tags: Array.isArray(product.tags) ? product.tags : [],
tags_en: Array.isArray(product.tags_en) ? product.tags_en : [],
```
Får aldrig tas bort eller villkoras. Saknat fält → tom array, aldrig null.

För eng�ngs-bulk-uppdatering utan att trigga `viewed=false` eller `booking_changes` finns `silent-tags-import`-funktionen (kör tyst, uppdaterar bara tags-fälten på existerande rader).
