## Plan

Jag kommer att instrumentera exakt flyttflödet för Skolfest 2604-64 och därefter rätta den underliggande logiken som idag ger det generiska felet "Kunde inte flytta händelsen".

### Vad som redan är bekräftat
- **2604-64 / Skolfest är en vanlig bokning**, inte ett large project.
- Den använder riktiga `calendar_events`-rader för:
  - `rig` 2026-04-23 på `team-2`
  - `rigDown` 2026-04-26 på `team-1`
- Nuvarande flyttdialog kör detta för vanliga bokningar:
  1. uppdaterar `calendar_events`
  2. uppdaterar `bookings`
  3. kör RPC `handle_booking_move(...)`
- Den RPC:n är idag **osäker**: den **tar bort gamla `booking_staff_assignments` först** och kontrollerar konflikter efteråt. Vid konflikt returneras `success: false`, vilket mycket sannolikt är varför flytten upplevs som att den misslyckas eller hoppar tillbaka.

### Implementation
1. **Lägg till tydliga frontend-loggar i flyttdialogen**
   - Instrumentera `src/components/Calendar/MoveEventDateDialog.tsx` med strukturerade `console.log` / `console.error` före och efter varje steg:
     - inkommande event-id / booking-id / booking-number / eventType
     - gammalt datum/team och nytt datum/team
     - resultat från `updateCalendarEvent`
     - resultat från bokningsuppdateringen
     - resultat från `handleBookingMove`
     - full felpayload vid catch
   - Ersätt dagens generiska toast med en toast som även visar **vilket steg** som failade och konfliktinfo när det finns.

2. **Lägg till tydliga service-loggar och bättre felpayload**
   - Instrumentera `src/services/staffCalendarService.ts` och `src/services/eventService.ts` så att vi får:
     - RPC-parametrar
     - Supabase-fel (`message`, `details`, `hint`, `code`)
     - tydlig logg när en move returnerar `success: false` utan att kasta databasfel
   - Säkerställ att fel inte maskeras bakom bara "Kunde inte flytta händelsen".

3. **Lägg till Postgres-loggar i `handle_booking_move`**
   - Skapa migration som uppdaterar DB-funktionen `public.handle_booking_move(...)` med `RAISE LOG` för:
     - start på anropet
     - booking/team/date-parametrar
     - vilka staff som påverkas
     - vilka konflikter som hittas
     - slutresultat
   - Loggarna ska gå att läsa i Supabase Postgres Logs så vi kan se exakt varför just Skolfest faller.

4. **Rätta den trasiga move-logiken**
   - Ändra `handle_booking_move(...)` så att den **validerar först och muterar sen**.
   - Om flytten inte kan genomföras fullt ut ska gamla `booking_staff_assignments` **inte raderas**.
   - Returnera tydlig konfliktpayload så UI:t kan säga t.ex. "2 personer ligger inte i Team 1 den dagen" istället för bara generell feltoast.

5. **Verifiera exakt med Skolfest 2604-64**
   - Testa flytten i previewn via dialogen på den bokning användaren pekat ut.
   - Läs browser-console + Postgres logs efter testet.
   - Bekräfta i databilden att:
     - `calendar_events` sparas korrekt
     - `booking_staff_assignments` inte tappas vid misslyckad flytt
     - UI inte längre hoppar tillbaka tyst

## Tekniska detaljer
- Filer som sannolikt ändras:
  - `src/components/Calendar/MoveEventDateDialog.tsx`
  - `src/services/staffCalendarService.ts`
  - `src/services/eventService.ts`
  - `supabase/migrations/...sql` (uppdaterad `handle_booking_move` med loggning + säkrare transaktionsflöde)
- Förväntad huvudorsak just nu:
  - flytten av eventet försöker samtidigt flytta dess bokningsbemanning,
  - men nuvarande RPC raderar gamla BSA-rader innan den vet att målteamet/måldatumet är giltigt,
  - och därför får ni ett generiskt fel utan att veta exakt vilken person/team-krock som orsakade det.

## Resultat efter genomförande
- Vi vet exakt **vilket steg** som faller för Skolfest.
- Databasloggar visar **varför** flytten nekas.
- Misslyckade flyttar blir **diagnostiska och reversibla**, inte tysta och destruktiva.
- När root cause är bekräftad i loggarna kan flytten göras stabil istället för att "hoppa tillbaka".