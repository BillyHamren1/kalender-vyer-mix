# Fix: Persistent white screen from stale Vite module URLs

## Vad som faktiskt händer

Skärmdumpen visar `net::ERR_ABORTED 404` på `PackingVerify.tsx` och `MobileProfile.tsx`. Båda är **statiska** imports högst upp i `src/App.tsx`. Det betyder:

1. Webbläsaren har kvar gamla, tids-stämplade modul-URL:er från en tidigare HMR-session.
2. Eftersom ALLT i `App.tsx` importeras statiskt, räcker det att **en enda** modul i kedjan är borta för att hela appen blir vit — `import('./App')` rejectar.
3. Boot-recovery i `src/main.tsx` triggar EN gång, lägger till `?__lovable_module_reload=...`, men det query-parametern bustar inte själva modul-URL:erna som `index.html` redan har cachat — så samma 404 repeteras.
4. När 15-sekunders cooldown slår in renderas felrutan, men i praktiken hinner användaren bara se vit skärm.

URL:en `/?__lovable_module_reload=1777379385570` bekräftar att recovery redan körts — men felet kvarstår.

## Lösningen — två lager

### 1. Hård cache-bust vid recovery (`src/main.tsx`)
Byt `window.location.replace(url + ?param)` mot ett riktigt cache-rensande omladdningsflöde:
- Avregistrera ev. service worker (`navigator.serviceWorker.getRegistrations()` → `unregister()`).
- Töm `caches` API (`caches.keys()` → `caches.delete()`).
- Sedan `window.location.reload()` (inte `replace` med querystring) så att webbläsaren hämtar färsk `index.html` med nya modul-URL:er.

Behåll cooldown-loggiken så vi inte hamnar i reload-loop, men öka fönstret till ~30 s och visa felrutan med en tydlig "Töm cache och ladda om"-knapp som upprepar samma rensning.

### 2. Lazy-loada tunga route-komponenter (`src/App.tsx`)
Konvertera de mest brott-känsliga sid-importerna till `React.lazy()` så att en enstaka stale chunk INTE tar ner hela appen — bara just den routen. Wrap routes med `<Suspense fallback={...}>`.

Minimum för att lösa det aktuella felet: `PackingVerify`, `MobileProfile`, samt mobil-sidorna och warehouse-sidorna som inte används på första rendering. Behåll layouts, providers, `Auth`, `NotFound`, `MainSystemLayout` som statiska.

Detta isolerar framtida stale-chunk-fel till den enskilda routen istället för hela bundle-trädet.

## Filer som ändras

- `src/main.tsx` — cache/SW-rensning + `location.reload()` istället för query-bust.
- `src/App.tsx` — `React.lazy(() => import(...))` för mobil-, warehouse- och övriga icke-kritiska sidor + en gemensam `<Suspense>` runt `<Routes>`.

## Vad användaren märker

- Vita skärmen försvinner: en stale modul tvingar en ren omladdning som faktiskt hämtar färska URL:er.
- Om en enskild sida ändå skulle ha en stale chunk: bara just den sidan visar laddspinner/felruta, resten av appen fungerar.
- Inga funktionella ändringar i logik — bara hur moduler hämtas.
