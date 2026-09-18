# Varför inga produkter syns – och hur vi får tillbaka dem

## Vad jag hittade (verifierat mot databasen)

- Produkterna finns kvar i databasen (12 832 rader), men 4 637 av dem är stämplade som "saknas i källan" – 4 279 stämplades 15 september och 358 den 16 september. Alla vyer (bokning, projekt, packlista, Time) döljer stämplade rader.
- På många bokningar är i praktiken allt stämplat, t.ex. 130 av 145 rader, 201 av 221 rader, 53 av 62 rader. Då blir listan tom trots att raderna finns.
- Av 72 kommande bokningar har bara 20 aktiva produktrader från lagersystemet.
- Bokningen du tittar på just nu (2026-09-18, skapad kl. 08:42) har noll produktrader över huvud taget.

## Orsaken

Den 15 september slogs "lagersystemet är facit"-läget på:

1. Bokningsimporten skapar inte längre några produktrader alls (`WMS_CANONICAL_PRODUCT_CUTOVER = true`). Nya bokningar får därför tomma produktlistor.
2. Speglingen från lagersystemet körs bara när packningssynken körs för en bokning. Vid den körningen stämplas alla rader som inte kom med i lagersystemets svar som "saknas" – det är där de gamla raderna försvann.
3. Bokningar som aldrig kört packningssynk, eller där lagersystemet saknar reservation, blir kvar utan en enda synlig rad.

Kort sagt: borttagningen av de gamla raderna rullades ut, men påfyllningen från lagersystemet täcker bara en del av bokningarna.

## Förslag på åtgärd

Steg 1 – Gör produkterna synliga igen utan att röra data
- Visa stämplade rader igen i bokningsvyn och projektets produktlista när bokningen saknar aktiva rader från lagersystemet, tydligt märkta "Ej bekräftad mot lager".
- Ingen radering, ingen ändring av stämplarna – bara visning.

Steg 2 – Fyll på från lagersystemet
- Kör produktspeglingen från lagersystemet för alla aktiva/kommande bokningar som saknar aktiva rader, och logga per bokning: lyckades, saknar reservation, eller fel.
- Resultatet ger en lista på vilka bokningar som verkligen saknas i lagersystemet och behöver rättas där.

Steg 3 – Täpp till hålet framåt
- Låt en bokning aldrig kunna hamna i läget "inga produkter alls": om lagersystemet inte svarar eller saknar reservation ska befintliga rader behållas synliga med varning i stället för att tyst döljas.
- Lägg till automattester som fångar "bokning med rader i databasen men tom lista i gränssnittet".

## Tekniska detaljer

- Döljningen sker via `source_missing_since` och filtreras i `src/components/project/ProjectProductsList.tsx`, `src/hooks/usePackingList.tsx`, `supabase/functions/sync-booking-to-packing/index.ts`, `supabase/functions/_shared/packingPreflight.ts` och `time-planning-proxy/workOrderReads.ts`.
- Stämplingen görs i `supabase/functions/_shared/wmsPackingList.ts` (`syncBookingProductsFromWms`, rad 871–881): alla befintliga rader vars `sync_key` inte finns i WMS-svaret markeras.
- Importen skriver inga produkter längre: `WMS_CANONICAL_PRODUCT_CUTOVER = true` i `supabase/functions/import-bookings/index.ts` (rad 104–105, gating på 3947/4112/4698).
- Backfill i steg 2 körs via befintlig `sync-booking-to-packing` per bokning – inga nya tabeller, inga migrationer, inga DELETE.

## Frågan jag behöver svar på

Vill du att jag börjar med steg 1 (synlighet direkt, inga dataändringar) och därefter kör backfill i steg 2, eller ska jag köra backfill först och bara visa det lagersystemet faktiskt returnerar?
