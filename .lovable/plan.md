

## Avsluta jobb — Checklista, kommentar och bilder

### Vad som byggs

En ny sida `/m/job/:id/complete` som öppnas via en "Avsluta jobb"-knapp på jobbdetaljen. Sidan innehåller:

1. **Produktchecklista** — alla produkter från bokningen visas som avcheckningsbara rader (grupperade som i befintlig produktlista)
2. **Kommentarsfält** — fritext för slutkommentar
3. **Bilduppladdning** — ta bilder / välj bilder som sparas till projektets fillagring (samma `mobileApi.uploadFile` som redan används)
4. **Skicka-knapp** — sparar checklistan + kommentaren och navigerar tillbaka

### Tekniska detaljer

| Fil | Ändring |
|-----|---------|
| `src/pages/mobile/MobileCompleteJob.tsx` | **NY** — huvudsida med checklista, kommentar, bilduppladdning |
| `src/pages/mobile/MobileJobDetail.tsx` | Lägg till "Avsluta jobb"-knapp (visas längst ner) |
| `src/App.tsx` | Registrera route `/m/job/:id/complete` |
| `src/shells/TimeAppShell.tsx` | Registrera samma route |

### Sidan `MobileCompleteJob`

- Hämtar bokningsdata via `useMobileBookingDetails(id)`
- Visar produkter som checkbox-lista (med samma gruppering/nästling som `JobInfoTab`)
- Textarea för kommentar
- Bilduppladdning med kamera/filväljare (återanvänder `takePhotoBase64` + `mobileApi.uploadFile`)
- Knappen "Avsluta jobb" skickar:
  - Kommentaren via `mobileApi.createComment`
  - Bilderna via `mobileApi.uploadFile` (en per bild)
  - Checklistan sparas som en kommentar med formaterad text (avcheckade/ej avcheckade produkter)
- Navigerar tillbaka till jobbdetaljen efter lyckad sparning

### Produktchecklista

Alla produkter visas — föräldrar med sina barn under. Varje rad har en checkbox. Hierarkin bevaras visuellt med indentering. Barn-produkter listas under sin förälder.

