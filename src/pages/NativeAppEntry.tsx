import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLastModule, setLastModule, NativeModule } from '@/utils/nativeModule';
import { ScanLine, Clock } from 'lucide-react';

/**
 * Native app entry point.
 * - If a previous module choice exists in localStorage, auto-navigates there.
 * - Otherwise shows a simple chooser screen.
 */
const NativeAppEntry: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const last = getLastModule();
    if (last === 'scanner') {
      navigate('/scanner', { replace: true });
    } else if (last === 'report') {
      navigate('/m', { replace: true });
    }
  }, [navigate]);

  const choose = (module: NativeModule) => {
    setLastModule(module);
    if (module === 'scanner') {
      navigate('/scanner', { replace: true });
    } else {
      navigate('/m', { replace: true });
    }
  };

  // If auto-redirecting, show nothing briefly
  const last = getLastModule();
  if (last) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">EventFlow</h1>
        <p className="text-muted-foreground text-sm">Välj vad du vill använda</p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={() => choose('scanner')}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <ScanLine className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-foreground">Scanner</div>
            <div className="text-xs text-muted-foreground">Skanna QR-koder</div>
          </div>
        </button>

        <button
          onClick={() => choose('report')}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-foreground">Tidrapport</div>
            <div className="text-xs text-muted-foreground">Rapportera tid & jobb</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default NativeAppEntry;
