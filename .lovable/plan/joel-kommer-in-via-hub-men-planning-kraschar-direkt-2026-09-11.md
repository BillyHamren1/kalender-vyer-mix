# Joel kommer in via HUB — men Planning kraschar direkt

## Vad kontrollen visar

- Joels inloggning via HUB gick igenom kl 07:14:54 idag. Loggen för inloggningstjänsten visar alla steg gröna (kontroll mot HUB, organisation, profil, roller, session skapad) för både Planering och Lager.
- Hans konto har rätt organisation (Frans August AB) och alla fyra behörigheter.
- Alltså är det inte inloggningen som fallerar. Skärmbilden är appens egen felruta ("Appen stötte på ett fel"), som visas när sidan kraschar efter att han redan är inloggad.
- Exakt vilket fel som kraschar går **inte** att slå fast härifrån: felet sparas bara lokalt i Joels egen webbläsare och skickas ingenstans. Det måste göras synligt innan något "fixas" på gissning.

## Plan

### 1. Gör felet synligt (först)
- Felrutan får en felkod och en "Kopiera felinfo"-knapp, så Joel kan skicka exakt vad som hände med ett klick.
- Kraschar rapporteras även till en central logg (organisation, sida, felkod, teknisk stack) i stället för enbart i hans webbläsare. Ingen känslig information och inga lösenord/tokens loggas.

### 2. Läs av det verkliga felet
Joel öppnar Planning från HUB en gång till, vi läser den centrala loggen och får exakt orsak och sida.

### 3. Åtgärda enligt utfallet
Först när steg 2 pekar ut orsaken görs den riktiga fixen, med test som täcker just det fallet.

### 4. Känd svaghet som tas med samtidigt
Flera livekopplingar i appen använder fasta, delade namn. Om samma koppling startas två gånger i samma flik kastar den ett fel som slår ut hela sidan — precis den sortens krasch som Joel ser. Samma fel har redan rättats på ett ställe tidigare (projektlistan). Vi gör namnen unika per organisation/instans genomgående och lägger ett test som hindrar att fasta namn smyger tillbaka.

## Teknisk detalj

- `src/components/diagnostics/GlobalErrorBoundary.tsx`: visa `code` + fingerprint och en kopieringsknapp.
- `src/services/diagnostics/diagnostics.ts`: lägg till en best-effort central sink (edge function) för severity `critical`, med fail-silent beteende och redigering av eventuella tokens.
- Ny liten edge function `report-diagnostic` (auth via befintlig JWT, org från `profiles`) + tabell `client_diagnostics` med GRANT/RLS enligt projektstandard (insert av `authenticated`, läsning endast admin).
- Realtime-härdning: unika kanalnamn (`${bas}-${organizationId}-${instansId}`) i hooks med fasta namn, t.ex. `useProjectInboxCount`, `FloatingInbox`, `useUnplannedTodos`, `usePackingProgress`, `useRealTimeCalendarEvents`, `jobsListService`; statiskt kontraktstest som förbjuder fasta strängnamn.
- Ingen ändring i SSO-flödet — det är verifierat grönt idag.
