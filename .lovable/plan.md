## Mål
Default-vyn av OpsLiveMap ska enbart visa personal. Jobb, platser/geofence och kameror är opt-in via toolbar.

## Ändring (en fil)
`src/components/ops-control/OpsLiveMap.tsx`

1. Ändra default state:
   - `showOrgLocations` → `useState(false)`
   - `showJobs` → `useState(false)`
   - `showStaff` lämnas `true`
   - `showCameras` lämnas `false`
2. Verifiera att render/effekt-flöden redan respekterar dessa flaggor:
   - org-platsmarkörer och geofence-lager: hoppas över när `showOrgLocations === false`
   - jobbmarkörer/badges + auto-öppen `selectedJob`: hoppas över när `showJobs === false`
   Om någon plats saknar guard, lägg till en kort `if (!flag) return;`-vakt i den marker-/effect-grenen (minimal kirurgisk ändring, ingen omstrukturering).
3. Legend: visa endast sektioner vars flagga är aktiv (`showStaff` → staff-statusar, `showJobs` → fas-legend, `showOrgLocations` → plats-legend, `showCameras` → kamera-legend). Lägg till conditional render där det saknas.
4. Toolbar-knapparna lämnas oförändrade så användaren kan slå på lagren.

## Verifiering
- Auto-typecheck/build passar.
- Preview `/ops-control`: vid laddning syns endast personal-pins. Klick på Jobb/Platser/Kameror visar respektive lager + legend.