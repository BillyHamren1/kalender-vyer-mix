## Mål
**ETT** anslagstavla-fält i hela systemet: `internalnotes` (på `projects` och `bookings`).
**Direktmeddelanden** (DM mellan personer) påverkas INTE — det är en separat funktion.

## Vad som verifierats
- `project_comments` har **7 rader** att migrera (stora projekt)
- `project_messages` har **0 rader** — tom, men koden är aktiv (delas mellan "Kommunikation"-flik och mobilens jobb-chat)
- `projects.internalnotes` används redan på 3 projekt
- `bookings.internalnotes` används på 24 bokningar
- `internalnotes` synkas redan via `import-bookings` från Booking-systemet
- `internalnotes` läses redan av: AI-assistent, mobilapp, normala projekt, bokningsvy

---

## Steg 1 — Migrera `project_comments` → `internalnotes`

Engångs-SQL (via migration-tool):

```sql
-- Slå ihop kommentarer per projekt och appenda till internalnotes med tidsstämpel + författare
WITH grouped AS (
  SELECT 
    project_id,
    string_agg(
      to_char(created_at, 'YYYY-MM-DD HH24:MI') || ' ' || author_name || ': ' || content,
      E'\n'
      ORDER BY created_at
    ) AS comment_block
  FROM project_comments
  GROUP BY project_id
)
UPDATE projects p
SET internalnotes = 
  CASE 
    WHEN COALESCE(p.internalnotes, '') = '' 
      THEN '--- Tidigare kommentarer ---' || E'\n' || g.comment_block
    ELSE p.internalnotes || E'\n\n' || '--- Tidigare kommentarer ---' || E'\n' || g.comment_block
  END
FROM grouped g
WHERE p.id = g.project_id;
```

Visa SELECT på resultatet **innan** vi droppar tabellen så användaren kan verifiera.

## Steg 2 — Stora projekt: lägg till anslagstavla, ta bort kommentarer
**`LargeProjectViewPage.tsx`** (eller motsvarande):
- Ta bort "Kommentarer"-fliken som använder `ProjectComments.tsx`
- Lägg till `ProjectInternalNotes`-komponenten på Översikt-fliken (samma plats som normala projekt)
- Säkerställ att `useLargeProjectDetail` hämtar `internalnotes` från projektet

## Steg 3 — Normala projekt: ta bort "Kommunikation"-fliken
**`ProjectViewPage.tsx`**:
- Ta bort `ProjectCommunication`-modulen (Internt/Leverantör/Kund-flikarna med tomma `project_messages`)
- Behåll `ProjectInternalNotes` som primär anslagstavla

## Steg 4 — Mobilappen: visa + tillåt redigering av `internalnotes`
- **`MobileJobDetail.tsx`**: visa `internalnotes` med en redigera-knapp (modal/inline textarea + spara via `mobile-app-api`)
- **`MobileProjectDetail.tsx`**: samma — `internalnotes` på projektnivå med redigeringsmöjlighet
- Ta bort `JobChatView` från mobilen om den **enbart** används mot `project_messages` (den per-jobb-chat-funktionen blir överflödig). Verifiera först att den inte används för DM också.
- `mobile-app-api` får ny endpoint `updateProjectInternalNotes(projectId, notes)` med org_id-isolering

## Steg 5 — Kodstädning (radera)
- `src/components/project/ProjectComments.tsx`
- `src/components/project/communication/ProjectCommunication.tsx` (hela mappen)
- `src/hooks/useProjectMessages.ts`
- `src/services/projectMessageService.ts`
- `src/types/projectMessage.ts`
- `src/hooks/useJobChat.ts` (om det enbart är för project_messages)
- `src/components/mobile-app/messages/JobChatView.tsx` (om det enbart är för project_messages)
- `src/services/__tests__/jobChatService.test.ts`
- Endpoints i `mobile-app-api/index.ts` som hanterar `project_messages` (chat-relaterade — verifiera att DM-endpoints inte påverkas)
- Refs i `useStaffDashboard`, `useMobileInbox`, `useUnreadMessageCount`, `push-notification-trigger` — uppdatera så att räknare/inbox bara visar **riktiga** DM, inte project_messages

## Steg 6 — Databas-städning (efter Steg 1-5 verifierats)
- `DROP TABLE project_comments`
- `DROP TABLE project_messages` 
- Tillhörande RLS-policies, index, realtime-publikationer

## Steg 7 — Bevara DM-systemet
**Detta rörs INTE:**
- Tabeller för direktmeddelanden mellan personer (kollar exakt namn — sannolikt `direct_messages` eller liknande)
- Inbox/notifikations-räknare för DM
- Push-notiser för DM
- `unified-messaging` ramverket

## Steg 8 — Memory-uppdatering
Lägg till constraint:
> **One Bulletin Board Policy:** `internalnotes` är ENDA fältet för projekt/bokningsanslagstavla. Tabellerna `project_comments` och `project_messages` är borttagna. Återinför ej. DM-funktionen är separat och orörd.

---

## Riskbedömning
- ✅ **Ingen dataförlust** — 7 kommentarer migreras innan drop, project_messages är tom
- ✅ **DM-systemet orört** — verifieras explicit i steg 4 & 7 innan kod tas bort
- ⚠️ **JobChatView i mobilen** — måste verifieras om den används för DM också. Om ja: behåll, koppla bort från `project_messages`.
- ⚠️ **Push-notifikationer** — `push-notification-trigger` refererar `project_messages`. Måste rensas så inga notiser försöker skickas mot tom/borttagen tabell.

## Leveransordning
1. Migrera data (steg 1) + visa verifiering
2. UI-ändringar (steg 2-4) så inget bryts
3. Kodstädning (steg 5)
4. Schema-drop (steg 6) — sista steget
5. Memory + dokumentation (steg 8)