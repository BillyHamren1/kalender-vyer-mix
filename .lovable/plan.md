
Mål: göra shell-valet 100% deterministiskt så Scanner aldrig kan hamna i Time-shell.

1) Normalisera app-mode i en enda källa (config)
- Uppdatera `src/config/appMode.ts` så mode bestäms explicit från `import.meta.env.VITE_APP_MODE`:
  - `scanner` => scanner
  - allt annat native => time (default)
  - web utan explicit mode => web
- Behåll export av `APP_MODE`, `isScannerApp`, `getDefaultRoute()` men se till att all logik går via samma resolver.
- Lägg till tydlig boot-logg i dev (env + resolved mode) för snabb felsökning.

2) Strukturera App.tsx med explicit branch per shell
- I `App.tsx`, rendera exakt en branch via `switch(APP_MODE)` (inte flera conditionals).
- Struktur:
  - `scanner` => `<ScannerAppShell />`
  - `time` => `<TimeAppShell />`
  - `web` => `<WebRoutes />`
- `WebTimeBootstrap` ska endast köras för `web/time`, aldrig scanner.
- Detta garanterar att Time-shellens redirect `/scanner -> /m` aldrig exekveras när scanner-mode är aktivt.

Exakt struktur för shell-val i App.tsx:
```tsx
const ShellEntry: React.FC = () => {
  switch (APP_MODE) {
    case 'scanner':
      return <ScannerAppShell />;
    case 'time':
      return <TimeAppShell />;
    case 'web':
    default:
      return <WebRoutes />;
  }
};
```
Och i render:
```tsx
{APP_MODE !== 'scanner' && <WebTimeBootstrap />}
<BrowserRouter>
  <ShellEntry />
</BrowserRouter>
```

3) Synka main.tsx med samma APP_MODE
- Byt scanner-detektering i `main.tsx` från direkt `import.meta.env.VITE_APP_MODE` till `APP_MODE === 'scanner'` för konsekvent beteende.
- Root-redirect (`/`) ska fortsätta använda `getDefaultRoute()` från samma mode-källa.

4) Build/Vite-härdning (viktigaste orsaken i praktiken)
- Ingen stor Vite-config-ändring krävs för routing, men build-sättet påverkar direkt:
  - använd `npm run build:scanner` (eller `npm run android:scanner`) istället för manuell inline env.
  - kör alltid `npx cap sync` efter build.
- Rekommenderat för att eliminera shell-problem mellan miljöer:
  - inför `.env.scanner` med `VITE_APP_MODE=scanner`
  - inför `.env.time` med `VITE_APP_MODE=time`
  - scripts: `vite build --mode scanner` / `vite build --mode time`
  (detta undviker shell/OS-problem med `VITE_APP_MODE=...`).

5) Verifiering
- Scanner-build:
  - `APP_MODE` loggas som `scanner`
  - `/` går till `/scanner`
  - Time-vyer (`/m`) mountas inte
- Time-build:
  - `APP_MODE` loggas som `time`
  - `/` går till `/m`
- Web preview:
  - `APP_MODE` blir `web`
  - fulla web-routes fungerar som tidigare.

Tekniska detaljer (kort)
- Er nuvarande kod väljer redan shell via `APP_MODE`, men native fallback i `appMode.ts` blir `time` när `VITE_APP_MODE` saknas. Då mountas Time-shell och dess redirect tar över (`/scanner -> /m`).
- Därför behövs både: tydligare entrypoint-branch i `App.tsx` + robust buildflöde som alltid sätter `VITE_APP_MODE` korrekt före `cap sync`.
