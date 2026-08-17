# Personal syns inte i personalkalendern (men fungerar i inkognito)

## Vad vi vet

Personalbadgarna hämtas alltid från databasen (`staff_assignments`), och datan är korrekt — samma rader finns oavsett vem som tittar. Skillnaden mellan Joels vanliga session och inkognito ligger i webbläsarens sparade kalenderinställningar:

- `calendarResources` (localStorage) är den enda källan till vilka team-kolumner som finns. Är listan gammal eller ofullständig i en profil renderas kolumnen aldrig — och all personal på den kolumnen blir osynlig, utan felmeddelande.
- `visibleTeamsByDay` (localStorage) sparar per datum vilka team som visas. En kolumn som någon gång dolts för ett datum förblir dold för alltid i den profilen.
- Synlighetslogiken tittar bara på bokningar (`calendar_events`), aldrig på personaltilldelningar. Ett team med personal men utan bokning den dagen kan därför falla bort.

Inkognito har ingen av dessa nycklar → allt visas. Det förklarar också varför hard refresh inte hjälper (localStorage rensas inte).

Exakt vilken av de två nycklarna som ställer till det i Joels profil är inte verifierat — därför löser vi båda och gör läget självläkande.

## Vad som byggs

1. **Team-kolumnerna blir robusta**
   - Vid inläsning kompletteras alltid listan med samtliga standardteam (Team 1–10 + Lager) — trasig/ofullständig JSON ignoreras och ersätts av standarduppsättningen.
   - Lägger till en cache-version: när versionen höjs återställs `calendarResources` automatiskt en gång per webbläsare, så gamla trasiga listor försvinner utan manuell rensning.
   - Extra skydd: om det finns personaltilldelningar eller bokningar på ett team-id som saknas i listan läggs kolumnen till automatiskt.

2. **Personaltilldelningar gör team synliga**
   - Synlighetsberäkningen får även personaltilldelningar som indata: har ett team personal en dag är kolumnen alltid synlig, precis som om den hade en bokning.

3. **Dolda team kan inte fastna för alltid**
   - `visibleTeamsByDay` rensas automatiskt från datum som passerat (äldre än ~30 dagar) så listan inte växer obegränsat.
   - Synlig knapp i kalenderns verktygsrad: "Återställ kalendervy" som nollställer sparade kolumn-/synlighetsinställningar i webbläsaren.

4. **Verifiering**
   - Enhetstester för synlighetslogiken (team med personal men utan bokning visas; okänt team-id från DB läggs till; korrupt `calendarResources` läker).
   - Automatiskt preview-test som laddar `/calendar`, sätter en "trasig" localStorage-state, laddar om och verifierar att kolumner och personalbadgar syns.

## Tekniska detaljer

- `src/components/Calendar/ResourceData.ts`: versionerad lagring (`calendarResources.v2`) + sanering vid inläsning.
- `src/hooks/useTeamResources.tsx`: merge mot `defaultTeams` blir obligatorisk; ta emot kända team-id:n (från events + assignments) och lägg till saknade.
- `src/lib/calendar/defaultVisibleTeams.ts`: `computeAutoVisibleTeamsForDay` får ny parameter `staffTeamIdsForDay`.
- `src/pages/CustomCalendarPage.tsx`: skickar in personaltilldelningar per dag, rensar gamla nycklar i `visibleTeamsByDay`, kopplar in återställningsknappen.
- Inga databas- eller RLS-ändringar; ingen ändring i skrivvägar för `staff_assignments`.
