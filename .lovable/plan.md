
## Fixa mejlknappar, lagg till mejlforhandsgranskning och byt avsandarnamn

### Problem 1: Mejlknapparna syns inte korrekt
Knappen "Acceptera korning" visas som bara en gron emoji-checkbox i vissa mejlklienter. Problemet ar att emoji-tecken (checkmark/kryss) i kombination med `<a>`-taggar renderas inkonsekvent. Losningen ar att:
- Ta bort emoji-tecken fran knapparna och anvanda ren text istallet
- Anvanda VML-knappar (Outlook-kompatibla) som fallback
- Lagga till `display:block` och explicit `width` for battre kompatibilitet
- Gora knapparna till separata rader istallet for tabellceller bredvid varandra (stapla vertikalt for mobilkompatibilitet)

### Problem 2: Mejlforhandsgranskning fore utskick
Lagg till en dialog som oppnas nar man klickar "Boka transport" for en extern partner. I dialogen visas:
- Mottagarens mejladress (ej redigerbar)
- Amnesrad (redigerbar)
- Fritt textfalt med ett meddelande till partnern (redigerbart, med default-text)
- Forhandsvisning av bokningsdetaljerna (ej redigerbara -- samma som i mejlet)
- Knapparna "Avbryt" och "Skicka mejl"

Flode:
1. Anvandaren klickar "Boka transport" i wizarden
2. Transporten skapas i databasen
3. Om det ar en extern partner: en mejldialog oppnas
4. Anvandaren kan redigera amnesrad och meddelandetext
5. Anvandaren klickar "Skicka" -- da anropas edge-funktionen med extra parametrar
6. Om anvandaren klickar "Avbryt" -- transporten ar redan bokad men inget mejl skickas

### Problem 3: Byt avsandarnamn
Andra fran "EventFlow Logistik" till "Frans August Logistik" i edge-funktionen, bade i `from`-faltet och i footer-texten i mejlet.

---

### Tekniska detaljer

**1. Uppdatera `supabase/functions/send-transport-request/index.ts`**

- Acceptera nya parametrar i request body: `custom_subject` (valfri amnesrad), `custom_message` (valfri meddelandetext)
- Byt `from: "EventFlow Logistik <noreply@fransaugust.se>"` till `from: "Frans August Logistik <noreply@fransaugust.se>"`
- Uppdatera footer-texten fran "EventFlow Logistik" till "Frans August Logistik"
- Fixa knapparna i HTML:
  - Ta bort emoji-tecken fran knapptexterna
  - Anvanda `display:block` och `width:100%` for full bredd
  - Separera knapparna i egna rader (varsin `<tr>`) for battre mejlklient-kompatibilitet
  - Lagga till `mso-padding-alt` for Outlook
- Om `custom_message` skickas: visa den som en extra sektion i mejlet, efter partner-halsningen

**2. Uppdatera `src/components/logistics/TransportBookingTab.tsx`**

- Lagg till ny state: `emailDialogOpen`, `emailSubject`, `emailMessage`, `pendingAssignmentId`
- Nar en extern partner-bokning skapas: spara assignment-ID, oppna mejldialogen istallet for att direkt skicka mejl
- Mejldialogen innehaller:
  - Mottagare (read-only, visas med Badge)
  - Amnesrad (`Input`, forifylld med default-subject)
  - Meddelande (`Textarea`, forifylld med default-text t.ex. "Hej [partner], vi har en ny transportforfragan...")
  - En sammanfattning av bokningsdetaljerna
  - "Avbryt"-knapp (stanger dialogen, inget mejl skickas)
  - "Skicka mejl"-knapp (anropar edge-funktionen med `custom_subject` och `custom_message`)

**3. Filer som andras**

| Fil | Andring |
|-----|---------|
| `supabase/functions/send-transport-request/index.ts` | Fixa knappar, byt avsandare, stod for custom subject/message |
| `src/components/logistics/TransportBookingTab.tsx` | Lagg till mejldialog med redigerbara falt |
