import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ruler, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNativeSiteScan } from '../native/useNativeSiteScan';

/**
 * Launcher for the native iOS SiteScan Measure flow.
 *
 * - On iPhone (Capacitor + iOS): immediately opens the native SwiftUI
 *   MeasureScreen via the SiteScanMeasure plugin.
 * - Everywhere else (Android, web preview, desktop): shows a clear
 *   instruction screen — no fake web measurement.
 */
const NativeMeasureLauncher: React.FC = () => {
  const navigate = useNavigate();
  const { isAvailable, platform, openMeasure } = useNativeSiteScan();
  const [launching, setLaunching] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  const launch = async () => {
    if (!isAvailable || launching) return;
    setLaunching(true);
    try {
      const result = await openMeasure({});
      if (result?.saved) {
        toast.success('Mätning sparad');
        if (result.scanId) {
          navigate(`/m/tools/measure/${result.scanId}`, { replace: true });
          return;
        }
      }
      navigate('/m/tools/measure', { replace: true });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg !== 'NATIVE_UNAVAILABLE') {
        toast.error('Kunde inte starta mätning', { description: msg });
      }
    } finally {
      setLaunching(false);
    }
  };

  // Auto-launch on iPhone the first time we land here.
  useEffect(() => {
    if (isAvailable && !autoTried) {
      setAutoTried(true);
      launch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAvailable, autoTried]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/m/tools/measure')}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-border/60"
          aria-label="Tillbaka"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Ny mätning</h1>
      </header>

      <div className="flex-1 px-5 flex flex-col items-center justify-center text-center max-w-md mx-auto w-full">
        {isAvailable ? (
          <>
            <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-5">
              {launching ? (
                <Loader2 className="w-9 h-9 animate-spin" />
              ) : (
                <Ruler className="w-9 h-9" />
              )}
            </div>
            <h2 className="text-xl font-bold mb-2">
              {launching ? 'Öppnar mätverktyget…' : 'Mätning redo'}
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Använd iPhonens AR-kamera för att placera punkter och mäta avstånd, höjd
              och bredd i 3D – precis som i Apples Mätverktyg.
            </p>
            <button
              onClick={launch}
              disabled={launching}
              className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-4 active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              {launching ? 'Startar…' : 'Starta mätning'}
            </button>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-3xl bg-muted text-muted-foreground flex items-center justify-center mb-5">
              {platform === 'android' ? (
                <AlertTriangle className="w-9 h-9" />
              ) : (
                <Smartphone className="w-9 h-9" />
              )}
            </div>
            <h2 className="text-xl font-bold mb-2">Mätning kräver iPhone</h2>
            <p className="text-muted-foreground text-sm mb-6">
              {platform === 'android'
                ? 'AR-mätverktyget använder Apples ARKit och fungerar bara i EventFlow Time på iPhone.'
                : 'Öppna EventFlow Time på din iPhone för att starta en ny mätning. Synkade mätningar visas här automatiskt.'}
            </p>
            <button
              onClick={() => navigate('/m/tools/measure')}
              className="w-full rounded-2xl bg-card border border-border/60 font-semibold py-4 active:scale-[0.99] transition-transform"
            >
              Tillbaka till mätlistan
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default NativeMeasureLauncher;
