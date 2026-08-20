# Fel statuspil i inkorgen: "Bekräftad → Avbokad"

## Vad som faktiskt hänt med #2605-49

Bokningen är **bekräftad** i databasen just nu. Texten är fel — den visar en gammal, redan återtagen händelse:

| Datum | Händelse |
|---|---|
| 4 aug 2026 | Bekräftad → Avbokad |
| 5 aug 2026 | Avbokad → Bekräftad (återaktiverad) |
| 18 + 20 aug 2026 | Interna anteckningar uppdaterade från bokningssystemet |

Anledningen till att bokningen ligger i inkorgen alls är de **interna anteckningarna** som ändrades 18 och 20 augusti — inte någon avbokning.

## Varför texten blir fel

Listan hämtar den senaste statusändringen per bokning, men hoppar över "aktiveringar" (allt som slutar i Bekräftad) eftersom vi bestämde att de inte är granskningsvärda. Problemet: när den hoppar över aktiveringen från 5 augusti fortsätter den bakåt i historiken och plockar den föregående raden — avbokningen från 4 augusti — och visar den som om den vore aktuell. Den kan alltså visa en statusändring som redan är ogjord, godtyckligt långt tillbaka i tiden.

## Vad som ska ändras

1. **Titta bara på den senaste statusändringen.** Om den är en aktivering (slutar i Bekräftad) visas ingen statusrad alls — sluta leta bakåt i historiken.
2. **Dubbelkolla mot bokningens nuvarande status.** En statusrad får bara visas om den ändringen matchar bokningens verkliga status idag. Annars är den ogjord och ska inte visas.
3. **Rätt undertext.** När ingen giltig statusändring finns ska raden visa vad som faktiskt ändrats ("1 ändring väntar") i stället för "Statusändring väntar".
4. **Regressionstest** som låser beteendet: en historik med avbokning följd av återbekräftelse ska ge noll statusrader.

## Teknisk detalj

- `src/hooks/useBookingStatusChanges.ts`: behåll bara första (senaste) status-raden per `booking_id` innan aktiveringsfiltret körs, i stället för att filtrera bort och gå vidare till nästa. Hooken tar emot en `Record<bookingId, currentStatus>` och släpper igenom raden endast när `to` matchar bokningens nuvarande status (skiftlägesokänsligt).
- `src/components/project/IncomingBookingsList.tsx`: skickar in status från `updatedBookingsMeta` till hooken; undertexten faller tillbaka till antal ändringar.
- Nytt test i `src/hooks/__tests__/bookingStatusChanges.test.ts` för historiken ovan.
- Ingen databasändring behövs — datan är korrekt, det är presentationen som är fel.

## Öppen fråga

Ska ändringar av **interna anteckningar** från bokningssystemet fortsätta hamna i "kräver granskning"? De är enda anledningen till att #2605-49 ligger där. Säg till om de ska räknas som brus, så tas de bort ur inkorgen i samma veva.
