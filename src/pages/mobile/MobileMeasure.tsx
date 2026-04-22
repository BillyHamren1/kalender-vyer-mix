import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Ruler, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { useSiteScansList } from '@/features/site-scans/hooks/useSiteScans';
import { toast } from 'sonner';

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const MobileMeasure: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useSiteScansList({
    page: 1,
    page_size: 20,
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  const scans = data?.data ?? [];

  const handleNewMeasurement = () => {
    navigate('/m/tools/measure/new');
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          Verktyg
        </p>
        <h1 className="text-2xl font-bold mt-1">Mätning</h1>
      </header>

      <div className="px-4 mb-4">
        <button
          onClick={handleNewMeasurement}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-primary text-primary-foreground font-semibold active:scale-[0.99] transition-transform shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Ny mätning
        </button>
      </div>

      <div className="px-5 pt-2 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Senaste mätningar</h2>
      </div>

      <div className="px-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Laddar mätningar…
          </div>
        )}

        {isError && (
          <div className="p-5 rounded-2xl bg-destructive/10 text-destructive text-sm">
            Kunde inte hämta mätningar. Försök igen senare.
          </div>
        )}

        {!isLoading && !isError && scans.length === 0 && (
          <div className="p-6 rounded-2xl bg-card border border-border/60 text-center">
            <Ruler className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <div className="font-medium">Inga mätningar ännu</div>
            <div className="text-sm text-muted-foreground mt-1">
              Tryck på "Ny mätning" för att börja.
            </div>
          </div>
        )}

        {scans.map((scan: any) => (
          <button
            key={scan.id}
            onClick={() => navigate(`/m/tools/measure/${scan.id}`)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary shrink-0">
              <Ruler className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base truncate">
                {scan.title || 'Mätning utan namn'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{formatDate(scan.created_at)}</span>
                {scan.status && (
                  <>
                    <span>·</span>
                    <span className="capitalize">{scan.status}</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileMeasure;
