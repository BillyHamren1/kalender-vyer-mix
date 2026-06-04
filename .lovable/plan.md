# Plan: återställ paketmedlemmar och tillbehör i packlistor

## Mål
Se till att packlistor och produktvyer alltid visar:
- paketmedlemmar
- tillbehör
- barnrader kopplade via både `parent_product_id` och `parent_package_id`

## Det jag kommer att fixa
1. **Rätta produktvisningen i pack-/bokningsvyn**
   - Uppdatera produkttabellen som matchar skärmbilden så att den inte tappar barnrader.
   - Sluta förlita visningen enbart på `parent_product_id`.
   - Hantera även `parent_package_id` och `is_package_component` så att paketmedlemmar och tillbehör visas under rätt huvudrad.

2. **Rätta packlistans read-model**
   - Uppdatera `usePackingList` och tillhörande typer så att packlistan hämtar och bär med hela hierarkin, inte bara `parent_product_id`.
   - Justera gruppering/rendering i packlistan så att barnrader inte faller bort eller felklassas som toppnivårader.
   - Säkerställa att "föräldralösa" barnrader fortfarande visas istället för att försvinna.

3. **Ta bort drift mellan klientsync och backend-sync**
   - Gå igenom den klientkod som idag genererar/synkar `packing_list_items` lokalt.
   - Anpassa den till samma regler som den kanoniska backend-synken, så att klienten inte bygger en annan packlista än backend.
   - Särskilt säkra att paketrubriker, paketmedlemmar och tillbehör behandlas konsekvent i alla vyer.

4. **Regressionstesta det som nu är trasigt**
   - Lägga tester för bokning med:
     - huvudprodukt
     - paketmedlemmar
     - tillbehör
     - barnrader via både `parent_product_id` och `parent_package_id`
   - Verifiera att både produktöversikt och packlista visar rätt rader.

5. **Verifiering efter fix**
   - Köra riktade tester.
   - Kontrollera i preview att samma typ av lista som i din skärmbild faktiskt visar paketmedlemmar och tillbehör igen.

## Tekniska ändringar
Troliga filer att uppdatera:
- `src/components/project/ProjectProductsList.tsx`
- `src/hooks/usePackingList.tsx`
- `src/types/packing.ts`
- `src/components/packing/PackingListTab.tsx`
- eventuellt `src/components/packing/DesktopChecklistView.tsx`

## Nuvarande fynd
Jag har redan verifierat att databasen **inte verkar sakna datat generellt**: flera aktuella packningar har `packing_list_items` kopplade till `booking_products` där många rader är barnrader/paketkomponenter. Det pekar alltså främst på ett **frontend/read-model-filter**, med möjlig sekundär drift i klientens egen packlistsync.