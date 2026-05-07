Problemet verkar inte vara att PDF:erna saknas. De finns i databasen och fil-URL:erna svarar korrekt med `content-type: application/pdf`. Det som fallerar är sannolikt öppningssättet i appen: projektvyn försöker visa PDF via dialog + `<iframe>` eller `window.open(..., '_blank')`, vilket ofta bryter i mobilapp/webview och i vissa inbäddade miljöer. Därför syns filerna men går inte att öppna pålitligt från projektet.

Plan

1. Byt öppningsstrategi för PDF i projektets filsida
- Uppdatera `src/components/project/ProjectFiles.tsx` så att PDF-rader inte förlitar sig på inbäddad `<iframe>` som primärt visningssätt.
- Inför ett säkrare flöde för PDF:
  - på klick: öppna filen via vanlig länk / explicit nedladdning i stället för intern preview
  - använd samma robusta mönster för både radklick och knapp
- Behåll bild-preview för bilder, men separera PDF-hanteringen från bildlogiken.

2. Lägg till app-säkert hjälpbeteende för externa filer
- Inför en liten återanvändbar helper för att öppna filer externt på ett sätt som fungerar bättre i mobil/webview.
- Prioritera beteende som inte kräver ny flik om miljön blockerar det.
- Om extern öppning inte stöds, fall back till direkt navigation till fil-URL.

3. Gör projektets fil-UI tydligt för PDF
- Visa PDF som “Öppna / Ladda ner” i stället för att antyda inline-preview om den inte är pålitlig.
- Säkerställ att hela raden och åtgärdsknappen använder samma logik.

4. Verifiera liknande ytor
- Gå igenom närliggande filvisningar för att se om samma mönster används där också, särskilt i mobilens bilagor.
- Om samma risk finns där, applicera samma helper så att beteendet blir konsekvent.

5. Kontroll
- Verifiera i preview att projektets PDF-länkar triggar rätt öppningsflöde.
- Bekräfta att bilder fortfarande previewas korrekt och att uppladdning/radering inte påverkas.

Tekniska detaljer
- Berörda filer, minst:
  - `src/components/project/ProjectFiles.tsx`
- Troliga kompletterande filer:
  - eventuell ny helper under `src/lib/` eller `src/utils/`
  - `src/components/mobile-app/job-tabs/JobAttachmentsSection.tsx` om samma öppningsproblem ska tätas där också
- Ingen backend- eller databasändring behövs för själva PDF-felet; datat och storage-svaret ser korrekt ut.

När du godkänner planen implementerar jag fixen direkt.