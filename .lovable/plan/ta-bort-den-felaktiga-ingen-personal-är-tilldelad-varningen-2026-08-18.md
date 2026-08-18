# Ta bort den felaktiga "Ingen personal är tilldelad"-varningen

## Vad varningen är

Den röda rutan kommer från `src/components/booking/StaffAssignmentWarning.tsx`, som renderas överst i bokningsvyn (`BookingDetailContent.tsx`). Den räknar rader i `booking_staff_assignments` för bokningen och visar varningen när antalet är 0 och statusen är bekräftad.

## Varför den är fel

Påståendet i texten stämmer inte med hur planeringen fungerar:

- Bokningen visas i personalkalendern via `calendar_events` (team-kolumn), inte via personaltilldelning. En bokning utan personal syns alltså redan i kalendern — det är just där man tilldelar personal.
- `booking_staff_assignments` är en härledd spegling av `staff_assignments × calendar_events.resource_id`, inte en förutsättning för att bokningen ska synas.

Resultatet blir den rundgång du beskriver: varningen ber dig tilldela personal i personalkalendern, samtidigt som den påstår att bokningen inte syns där.

## Ändring

- Ta bort renderingen av `StaffAssignmentWarning` i `src/components/booking/detail/BookingDetailContent.tsx`.
- Ta bort filen `src/components/booking/StaffAssignmentWarning.tsx` (används ingen annanstans).

Inga databas-, RLS- eller planeringslogikändringar. Ingen annan del av bokningsvyn rörs.

## Verifiering

- Öppna en bekräftad bokning utan personal i preview och bekräfta att den röda rutan är borta och att resten av vyn renderar oförändrad.
- Kör testsviten för att säkerställa att inget test refererar komponenten.
