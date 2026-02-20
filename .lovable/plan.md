
# Besiktningsflode i mobilappen (Steg 1)

## Oversikt
En ny "Skapa besiktning"-knapp laggs till langst ned i Info-fliken pa jobbdetaljsidan. Knappen oppnar en steg-for-steg-widget (wizard) som overlay/modal. I denna forsta fas byggs **Steg 1: Transportvag och avlastningsyta**.

## Anvandargranssnittet

Steg 1 innehaller:
- Rubrik: "Dokumentera transportvag in samt yta for avlastning"
- En kameraknapp som oppnar kameran (ateranvander befintlig `takePhotoBase64` och webbfallback)
- Stod for bade bilder och korta videoklipp (max 10 sekunder) via `accept="image/*,video/*"`
- Galleri med tumnaglar av sparade bilder/videos (obegransat antal)
- Mojlighet att ta bort enskilda bilder/videos fore uppladdning
- Ett textfalt "Transportinfo" (textarea)
- "Nasta"-knapp for att ga vidare (forberedd for framtida steg)
- "Avbryt"-knapp for att stanga wizarden

## Tekniska detaljer

### Nya filer
1. **`src/components/mobile-app/inspection/InspectionWizard.tsx`**
   - Huvudkomponent for steg-for-steg-wizarden
   - Hanterar state for aktuellt steg, mediafiler (lokalt som base64 fore sparning), och textdata
   - Renderas som en fullskarmsoverlay (liknande bildforhandsvisningen i JobPhotosTab)

2. **`src/components/mobile-app/inspection/StepTransportRoute.tsx`**
   - Steg 1-komponenten
   - Kameraknapp (ateranvander `takePhotoBase64` fran `capacitorCamera.ts`)
   - Dold fil-input med `accept="image/*,video/*"` och `capture="environment"` som webbfallback
   - For video: begransning till 10 sekunder valideras pa klientsidan via `HTMLVideoElement.duration`
   - Tumnaglar-grid for tillagda media
   - Textarea for "Transportinfo"

### Andrade filer
3. **`src/components/mobile-app/job-tabs/JobInfoTab.tsx`**
   - Lagg till en "Skapa besiktning"-knapp langst ned i komponenten
   - State (`showInspection`) som togglar visning av `InspectionWizard`

### Datahantering
- I denna fas sparas media och text lokalt i komponentens state (inget skrivs till databasen annu)
- Wizarden ar forberedd for att i framtida steg spara data via edge function / API
- Bilder lagras temporart som base64-strangar i en array
- Videos lagras pa samma satt (base64 data-URL)

### Videobegransning (10 sekunder)
- Nar en videofil valjs, laddas den i en dold `<video>`-element
- `loadedmetadata`-eventet lasas for att kontrollera `duration`
- Om langre an 10 sekunder visas ett felmeddelande via `toast.error`
