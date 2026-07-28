// Contract test: Status Demote-grenen i import-bookings får ALDRIG innehålla
// en booking_products-delete. External API som returnerar 0 är per definition
// transient och får inte radera lokala produkter.
//
// Kör: deno test supabase/functions/import-bookings/statusDemoteProductGuard.contract.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("Status Demote-grenen raderar inte booking_products", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  const marker = "[Status Demote]";
  const markerIdx = src.indexOf(marker);
  assert(markerIdx > -1, "Kunde inte hitta [Status Demote]-grenen i index.ts");

  // Ta ett fönster runt Status Demote (ca 100 rader efter markören) och sök
  // efter förbjuden produkt-delete i cleanupOps.
  const window = src.slice(markerIdx, markerIdx + 5000);

  const forbidden = /from\(\s*['"]booking_products['"]\s*\)\s*\.delete\s*\(/;
  assert(
    !forbidden.test(window),
    "Status Demote-grenen innehåller en booking_products.delete — det får aldrig återinföras. " +
      "External API som returnerar 0 är transient och får inte radera produkter.",
  );
});
