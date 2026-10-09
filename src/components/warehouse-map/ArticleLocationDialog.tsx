import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, MapPin, RefreshCw, WifiOff, Lock, HelpCircle, PackageSearch } from 'lucide-react';
import { useArticleLocations } from '@/hooks/useArticleLocations';
import type { ArticleLocationsFetcher } from '@/services/articleLocationsService';
import { HallMapSvg } from './HallMapSvg';
import { RackFrontView } from './RackFrontView';
import type { ArticleLocationsResponse } from '../../../supabase/functions/_shared/warehouseArticleLocations';

export interface ArticleLocationTarget {
  name: string;
  itemTypeId: string;
  instanceId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ArticleLocationTarget | null;
  fetcher: ArticleLocationsFetcher;
  organizationId?: string | null;
  sessionKey?: string | null;
}

const ERROR_ICON = { offline: WifiOff, permission: Lock, unauthorized: Lock } as const;

export const ArticleLocationDialog: React.FC<Props> = ({ open, onOpenChange, target, fetcher, organizationId, sessionKey }) => {
  const instanceId = target?.instanceId ?? null;
  const { state, refresh, isArticleFallback, showArticleLocations, showInstance } = useArticleLocations({
    enabled: open && !!target, itemTypeId: target?.itemTypeId ?? null, instanceId, organizationId, sessionKey, fetcher,
  });
  const data = state.phase === 'ready' ? state.data : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <MapPin className="h-5 w-5 text-primary shrink-0" aria-hidden />
            <span className="truncate">{data?.article.name ?? target?.name ?? 'Artikel'}</span>
          </DialogTitle>
          <DialogDescription>
            {instanceId && !isArticleFallback ? 'Plats för den skannade enheten' : 'Artikelns lagerplatser'}
            {data?.article.sku ? ` · ${data.article.sku}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isArticleFallback && (
          <div role="note" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Visar artikelns alla platser. Det här visar <strong>inte</strong> var den skannade enheten ligger.
            <Button variant="link" size="sm" className="h-auto p-0 ml-1 text-xs" onClick={showInstance}>Tillbaka till enheten</Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={refresh} disabled={state.phase === 'loading'} aria-label="Uppdatera platser">
            <RefreshCw className={`h-4 w-4 mr-1 ${state.phase === 'loading' ? 'animate-spin' : ''}`} /> Uppdatera
          </Button>
        </div>

        {state.phase === 'loading' && (
          <div className="flex items-center justify-center py-10 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Hämtar lagerplatser…
          </div>
        )}

        {state.phase === 'error' && (() => {
          const Icon = (ERROR_ICON as any)[state.error.kind] ?? AlertCircle;
          return (
            <div role="alert" data-error-kind={state.error.kind} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">{state.error.message}</p>
                  {state.error.code && <p className="text-xs text-muted-foreground mt-0.5">Felkod: {state.error.code}</p>}
                </div>
              </div>
              {state.error.kind !== 'permission' && state.error.kind !== 'unauthorized' && (
                <Button size="sm" variant="outline" className="mt-2" onClick={refresh}>Försök igen</Button>
              )}
            </div>
          );
        })()}

        {data && (
          <LocationsBody
            data={data}
            onArticleFallback={instanceId && !isArticleFallback && data.status !== 'PLACED' ? showArticleLocations : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const LocationsBody: React.FC<{ data: ArticleLocationsResponse; onArticleFallback?: () => void }> = ({ data, onArticleFallback }) => {
  const exact = data.placements.filter((p) => p.state === 'EXACT');
  const [mapId, setMapId] = useState<string | null>(exact[0]?.slot?.mapId ?? data.maps[0]?.id ?? null);
  const [rackId, setRackId] = useState<string | null>(exact[0]?.slot?.rackId ?? null);
  useEffect(() => {
    setMapId(exact[0]?.slot?.mapId ?? data.maps[0]?.id ?? null);
    setRackId(exact[0]?.slot?.rackId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const map = data.maps.find((m) => m.id === mapId) ?? null;
  const slotsOnMap = useMemo(() => exact.filter((p) => p.slot!.mapId === mapId).map((p) => p.slot!), [exact, mapId]);
  const highlighted = useMemo(() => new Set(slotsOnMap.map((s) => s.rackId)), [slotsOnMap]);
  const rack = map?.racks.find((r) => r.id === rackId) ?? null;

  return (
    <div className="space-y-3">
      {data.status === 'UNPLACED' && (
        <StatusNote icon={PackageSearch} text="Artikeln har ingen registrerad plats i lagret." />
      )}
      {data.status === 'UNKNOWN' && (
        <StatusNote icon={HelpCircle} text="Platsen är okänd – pallen pekar på ett fack som saknas eller är ogiltigt." />
      )}
      {onArticleFallback && (
        <Button variant="secondary" size="sm" onClick={onArticleFallback}>Visa artikelns platser</Button>
      )}

      {data.placements.length > 0 && (
        <ul className="space-y-2" aria-label="Platser">
          {data.placements.map((p, i) => {
            const selected = p.state === 'EXACT' && p.slot!.mapId === mapId && p.slot!.rackId === rackId;
            return (
              <li key={`${p.palletId}-${i}`}>
                <button type="button" disabled={p.state !== 'EXACT'}
                  onClick={() => { if (p.slot) { setMapId(p.slot.mapId); setRackId(p.slot.rackId); } }}
                  aria-pressed={selected}
                  className={`w-full text-left rounded-md border p-2.5 text-sm transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} disabled:cursor-default`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{p.address ?? (p.state === 'EXACT' ? `${p.rackName ?? ''} ${p.bayLabel ?? ''}`.trim() : 'Ingen plats')}</span>
                    <span className="font-mono shrink-0">{p.quantity} st</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Pall {p.palletCode} · {p.palletName}
                    {p.slot && ` · ${p.slot.level === 1 ? 'Golv' : `Nivå ${p.slot.level}`}, position ${p.slot.position}, djup ${p.slot.depth}`}
                  </div>
                  {p.state === 'PALLET_UNPLACED' && <div className="text-xs text-amber-700 mt-0.5">Pallen är inte placerad</div>}
                  {p.state === 'SLOT_MISSING' && <div className="text-xs text-destructive mt-0.5">Facket saknas/ogiltigt</div>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data.maps.length > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Kartor">
          {data.maps.map((m) => (
            <Button key={m.id} role="tab" aria-selected={m.id === mapId} size="sm" variant={m.id === mapId ? 'default' : 'outline'}
              onClick={() => { setMapId(m.id); setRackId(exact.find((p) => p.slot!.mapId === m.id)?.slot?.rackId ?? null); }}>
              {m.name}
            </Button>
          ))}
        </div>
      )}

      {map && (
        <>
          <HallMapSvg map={map} selectedRackId={rackId} highlightedRackIds={highlighted} onSelectRack={setRackId} />
          {rack && <RackFrontView rack={rack} slots={slotsOnMap.filter((s) => s.rackId === rack.id)} />}
        </>
      )}
      <p className="text-[10px] text-muted-foreground text-right">Uppdaterad {new Date(data.serverTimestamp).toLocaleString('sv-SE')}</p>
    </div>
  );
};

const StatusNote: React.FC<{ icon: React.ComponentType<{ className?: string }>; text: string }> = ({ icon: Icon, text }) => (
  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2.5 text-sm" role="status">
    <Icon className="h-4 w-4 text-muted-foreground shrink-0" /> {text}
  </div>
);
