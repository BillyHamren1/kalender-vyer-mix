# P1-kontraktskorrigering och hosted rerun

## Mål
Korrigera endast Planning→Time-tjänstebeviset så att det exakt matchar Time v12-verifieraren i commit `5022d52ddc82d27132ab4f58a6110b0eba0a89c8`, deploya proxyn till staging och omedelbart köra den riktiga hostade Time V2-resan.

## Genomförande
1. Ersätt det nuvarande tvåheadersformatet med ett kompakt ES256-JWT i endast `x-planning-service-proof`.
2. Ändra signeraren till exakt header `{alg,typ,kid}` och claims `{schema,aud,operation,organizationId,iat,exp,nonce,bodySha256}`; SHA-256 ska vara lowercase hex över exakt samma JSON-bytes som skickas upstream och signaturen ska vara WebCryptos råa ES256-signatur över `headerSegment.claimsSegment`.
3. Behåll server-side staging-organisationen och valfri system-token-backup, men vidarebefordra aldrig Planning-användarens bearer-token. Ändra ingen annan funktionalitet.
4. Uppdatera fokuserade fixture-/verifierartester så att de låser tresegmentformat, exakta nycklar, tidsregler, digest, signatur och singelheader. Kör Deno-fixtures, relevanta Vitest-tester, TypeScript-kontroll och build.
5. Deploya exakt uppdaterad `time-planning-proxy` till Planning staging och verifiera deployment/loggar.
6. Skapa en tillfällig syntetisk HUB/Planning-användare med Planning-access, logga in i preview med Playwright och slå på Time V2 endast lokalt för sessionen.
7. Kör hosted-resan genom proxyn: manifest/status, review queue och detalj, korrigering om submission finns, personnel och payroll/project previews. Notera exakta upstream-statuskoder och kontraktsversioner samt verifiera att Time identifierar `planning_service`.
8. Radera testanvändaren. Om nästa P0/P1-blockerare uppstår: dokumentera exakt kod/body och stoppa utan sidofixar.

## Tekniska avgränsningar
- Ingen ändring av legacy Time, andra features, dokumentation eller generell hardening.
- Feature flag förblir OFF som standard.
- Inga destruktiva databasoperationer utöver explicit borttagning av den disponibla testanvändaren.
- Slutrapporten anger aktuellt repo-commit-SHA och den deployade proxyversion som plattformen rapporterar.
