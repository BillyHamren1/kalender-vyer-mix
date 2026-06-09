# Plan: visa bara externa Booking-uppdateringar i granskningslistan

## Mål
Granskningslistan på `/projects` ska bara visa uppdateringar som faktiskt kommer från Booking-flödet, inte interna ändringar gjorda i Planning.

## Vad jag ändrar
1. Uppdatera SQL-funktionen `get_unseen_booking_updates()` så att den bara räknar `booking_changes` där `changed_by` är en extern källa:
   - `service_role`
   - `booking-import`
   - `booking-webhook`
2. Låta samma externa-källa-filter gälla både:
   - senaste ändringstid (`last_change_at`)
   - antal väntande ändringar (`change_count`)
3. Lägga till ett kontraktstest som låser att `get_unseen_booking_updates()` fortsätter filtrera på extern källa, så att detta inte regressar igen.
4. Verifiera i test att interna `authenticated`-ändringar inte längre kvalar in i granskningslistan.

## Förväntad effekt
- Listan “Uppdaterade · kräver granskning” visar bara förändringar från Booking/import/webhook.
- Ändringar som görs lokalt i Planning fortsätter kunna loggas i `booking_changes`, men de dyker inte upp som något att granska.
- Antalet uppdateringar på `/projects` ska falla tillbaka till det som faktiskt behöver granskas.

## Tekniska detaljer
- Problemkällan sitter i databasen, inte främst i React-komponenten.
- `track_booking_changes()` har redan logik för att skilja extern källa från intern, men `get_unseen_booking_updates()` använder idag alla `update/status_change` utan att filtrera på `changed_by`.
- Lösningen blir därför en liten migration som skärper urvalet i RPC:n, plus ett Vitest-kontrakt som läser senaste migrationen och verifierar SQL-regeln.