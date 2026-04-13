

## Plan: Fixa QRScanner kamera-deadlock

### Problemet
I `QRScanner.tsx` rad 447-462 finns ett klassiskt render-deadlock:
- `startCamera()` sätter state till `'starting'`
- I `'starting'`-läget renderas **bara en spinner** (rad 447-452)
- `<video ref={videoRef}>` renderas **bara** i `else`-grenen (rad 454+), dvs `'running'`
- `startCamera()` försöker sätta `videoRef.current.srcObject = stream` (rad 258), men elementet finns inte i DOM
- State går aldrig till `'running'` → evig spinner

### Fix
**En ändring i `src/components/scanner/QRScanner.tsx`:**

1. **Rendera `<video>` och `<canvas>` ALLTID** (inte bara i `running`-state) — gör dem dolda visuellt under `starting` men närvarande i DOM så att `videoRef.current` finns
2. **Visa spinner som overlay** ovanpå video-elementet under `starting`, istället för att ersätta det
3. **Lägg till diagnostiska logs** vid varje nyckelsteg: overlay öppnad, `videoRef.current` status, före/efter `getUserMedia`, stream-resultat, `srcObject`-tilldelning

### Konkret renderändring
```
{/* Video + canvas ALLTID i DOM */}
<video ref={videoRef} className={cameraState === 'running' ? 'visible' : 'invisible absolute'} ... />
<canvas ref={canvasRef} className="hidden" />

{/* Overlay: spinner under starting, scanning-ram under running */}
{cameraState === 'starting' && <SpinnerOverlay />}
{cameraState === 'running' && <ScanningOverlay />}
{cameraState === 'error' && <ErrorView />}
```

### Vad som INTE ändras
- Ingen Android/Zebra/DataWedge-påverkan
- Ingen iOS native-kod
- Ingen backend/edge function
- Alla befintliga timeouts, fallbacks och felhantering behålls
- `skipCamera`-logiken orörd

