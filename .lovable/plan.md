

## Plan: Fixa saknad/felaktig ikonstorlek i iOS

### Problem
Filen `AppIcon-512@2x.png` finns i icon-mappen men saknas i `Contents.json`. Xcode visar den med en varningssymbol. Denna fil hör inte till det moderna "universal iOS"-formatet — Xcode förväntar sig bara 1024x1024@1x som App Store-ikon (vilken redan finns).

### Lösning
1. **Ta bort `AppIcon-512@2x.png`** från `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — den är en kvarleva som inte behövs och orsakar varningen i Xcode.

Det är allt som behövs. Alla korrekta storlekar (20pt–1024pt) finns redan definierade i `Contents.json` och genereras av `generate-icons.js`.

### Teknisk detalj
- Filen `AppIcon-512@2x.png` (1024px) är redundant eftersom `AppIcon-1024x1024@1x.png` redan täcker App Store-ikonen
- `Contents.json` refererar inte till 512-filen, vilket gör att Xcode flaggar den som oregistrerad

