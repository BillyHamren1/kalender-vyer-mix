## Problem

På iOS (Capacitor WKWebView) öppnas inte bilder eller PDF:er i mobilappen. Orsaken är att flera ställen använder vanliga `<a target="_blank">` eller `window.open()` direkt mot `*.supabase.co`. WKWebView blockerar nya fönster och blob: URL:er fungerar dåligt — länkarna blir tysta no-ops.

Vi har redan en korrekt helper `src/lib/files/openFileExternally.ts` som på native använder `@capacitor/browser` (`Browser.open({ url, presentationStyle: "fullscreen" })`). Den används i `JobAttachmentsSection`, men inte överallt.

## Fix

Routea alla bild-/fil-/PDF-öppningar i mobilappen genom `openFileExternally`.

**Filer att ändra (presentation-/UI-lager):**

1. `src/components/mobile-app/job-tabs/JobPhotosTab.tsx`
   - Byt `<a href={file.url} target="_blank">` (dokument/PDF) mot `<button onClick={() => openFileExternally(file.url, file.file_name)}>`.
   - Behåll inline-lightbox för bilder, men lägg en "Öppna i full skärm"-knapp som anropar `openFileExternally` (fallback om iOS-bildvisaren strular).

2. `src/components/mobile-app/messages/ImageLightbox.tsx`
   - Byt nedladdnings-/öppna-länken (`<a href target="_blank">`) mot knapp som kallar `openFileExternally`.

3. `src/components/mobile-app/messages/MessageBubble.tsx`
   - Byt fil-attachment `<a href={msg.file_url} target="_blank">` mot `<button onClick={() => openFileExternally(msg.file_url, msg.file_name)}>` (behåll samma styling).

4. `src/components/mobile-app/lager/LagerExpensesSection.tsx`
   - Byt kvitto-`<a target="_blank">` mot knapp som kallar `openFileExternally`.

## Verifiering

- Lägg till ett vitest-test som scannar `src/components/mobile-app/**` och `src/pages/mobile/**` och misslyckas om en `<a … target="_blank">` används för supabase-storage-länkar (file_url, receipt_url, attachment.url) — låser fixen så den inte regrederar.
- Kör `bash scripts/test-time-reporting.sh` (om tillämpligt) + `bunx vitest run`.
- Manuell verifiering kräver iOS-build (`npx cap sync ios` efter pull).

## Vad jag INTE ändrar

- `tel:` / `mailto:` / Google Maps-länkar (de fungerar redan via `_system` / native intents).
- `openFileExternally` i sig — den är redan korrekt.
- Backend / signed URL-logik.