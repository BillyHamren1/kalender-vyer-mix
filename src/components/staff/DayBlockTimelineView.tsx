import React, { createContext, useContext, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Car, ArrowRight, HelpCircle, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import type { DayBlock, PresenceBlock, JourneyBlock, GapBlock, GapReason } from '@/lib/staff/dayBlockTimeline';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { AddressMapDialog } from './AddressMapDialog';
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';

interface ExcludeCtx {
  canExclude: boolean;
  onExclude?: (blockId: string) => void | Promise<void>;
}
const ExcludeContext = createContext<ExcludeCtx>({ canExclude: false });

interface MapCtx {
  staffId?: string;
  date?: string;
}
const MapContext = createContext<MapCtx>({});

const RowExcludeButton: React.FC<{ blockId: string; label: string }> = ({ blockId, label }) => {
  const { canExclude, onExclude } = useContext(ExcludeContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canExclude || !onExclude) return null;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label="Ta bort händelse från dagens rapport"
          title="Ta bort från dagens rapport"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort denna händelse från dagens tolkning?</AlertDialogTitle>
          <AlertDialogDescription>
            "{label}" döljs från huvudjournalen och räknas inte längre med i dagsstart, dagslut,
            arbetsdag, projektvistelser, förflyttningar eller summeringar.
            <br /><br />
            <strong>Inget raderas:</strong> rå GPS-pings, assistant-events och time-tracking-data
            ligger kvar oförändrade i råvyn ("Visa alla händelser") och kan när som helst återställas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try { await onExclude(blockId); } finally { setBusy(false); setOpen(false); }
            }}
          >
            Ta bort
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const fmtHm = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('sv-SE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
    });
  } catch { return formatStockholmHm(iso); }
};

const fmtDur = (m: number) => {
  if (!m || m < 1) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
};

/**
 * Härled en säker label för en endpoint (presence eller journey).
 * Huvudvyn får ALDRIG visa "okänd plats" ensam — vi mappar alltid
 * lookupStatus + lat/lng till en meningsfull text.
 */
const safePlaceLabel = (
  place?: { label?: string | null; lat?: number | null; lng?: number | null; lookupStatus?: string } | null,
  fallback?: string | null,
): string => {
  const raw = (place?.label ?? fallback ?? '').trim();
  const isUnknownOnly = !raw || /^okänd plats$/i.test(raw);
  if (!isUnknownOnly) return raw;
  const status = place?.lookupStatus;
  const hasCoord = place?.lat != null && place?.lng != null;
  if (status === 'failed') return 'Okänd plats – adress kunde inte hämtas';
  if (status === 'pending') return 'Slår upp adress…';
  if (hasCoord) return 'Slår upp adress…';
  return 'Okänd plats – saknar koordinat';
};

type PlaceLike = {
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  lookupStatus?: string;
} | null | undefined;

const buildMapUrl = (p: PlaceLike): string | null => {
  if (!p) return null;
  if (p.mapUrl) return p.mapUrl;
  if (p.lat != null && p.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  }
  return null;
};

/**
 * Renderar platsetikett som klickbar länk när lat/lng finns.
 * Faller tillbaka till vanlig <span> när vi saknar koordinater
 * (t.ex. matched_internal utan koordinat).
 */
const PlaceLabel: React.FC<{
  place: PlaceLike;
  fallback?: string | null;
  className?: string;
  segmentStartIso?: string;
  segmentEndIso?: string;
}> = ({ place, fallback, className, segmentStartIso, segmentEndIso }) => {
  const label = safePlaceLabel(place, fallback);
  const hasCoord = place?.lat != null && place?.lng != null;
  const { staffId, date } = useContext(MapContext);
  const [open, setOpen] = useState(false);
  if (!hasCoord) {
    return <span className={className}>{label}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`${className ?? ''} inline-flex items-center gap-0.5 hover:underline text-left`}
        title="Visa på karta"
      >
        <span className="truncate">{label}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      <AddressMapDialog
        open={open}
        onOpenChange={setOpen}
        address={place?.label ?? label}
        coords={{ lat: place!.lat as number, lng: place!.lng as number }}
        staffId={staffId}
        date={date}
        segmentStartIso={segmentStartIso}
        segmentEndIso={segmentEndIso}
      />
    </>
  );
};

/**
 * Liten chip som visar vad som finns på platsen enligt Mapbox POI.
 * Renderas bara när reverse-geocoden har returnerat ett vettigt POI-namn.
 */
const PoiChip: React.FC<{
  place?: {
    poiName?: string | null;
    poiCategory?: string | null;
    poiDistanceMeters?: number | null;
  } | null;
}> = ({ place }) => {
  const name = place?.poiName?.trim();
  if (!name) return null;
  const cat = place?.poiCategory?.split(',')[0]?.trim() ?? null;
  const dist = place?.poiDistanceMeters ?? null;
  const tooltipParts: string[] = [];
  if (cat) tooltipParts.push(cat);
  if (dist != null) tooltipParts.push(`~${dist} m`);
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-medium max-w-[14rem] truncate"
      title={tooltipParts.length ? `Mapbox POI · ${tooltipParts.join(' · ')}` : 'Mapbox POI'}
    >
      <span>📍</span>
      <span className="truncate">{name}</span>
    </span>
  );
};

/** Lista över andra POI i närheten för expand-vyn. */
const NearbyPoiList: React.FC<{
  place?: {
    nearbyPois?: Array<{ name: string; category: string | null; distanceMeters: number | null; mapsUrl?: string }> | null;
    poiName?: string | null;
  } | null;
}> = ({ place }) => {
  const list = (place?.nearbyPois ?? []).filter((p) => p.name && p.name !== place?.poiName).slice(0, 4);
  if (list.length === 0) return null;
  return (
    <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/20">
      <span className="font-medium text-foreground/80">I närheten:</span>{' '}
      {list.map((p, i) => (
        <React.Fragment key={`${p.name}-${i}`}>
          {i > 0 && <span> · </span>}
          {p.mapsUrl ? (
            <a
              href={p.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
              title={p.category ? `${p.category}${p.distanceMeters != null ? ` · ~${p.distanceMeters} m` : ''}` : undefined}
            >
              {p.name}
            </a>
          ) : (
            <span title={p.category ?? undefined}>{p.name}</span>
          )}
          {p.distanceMeters != null && <span className="text-muted-foreground/70"> ({p.distanceMeters}m)</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Shared row primitives — kompakta rader (~34–40px höga)            */
/* ------------------------------------------------------------------ */

const GRID = 'grid grid-cols-[190px_minmax(0,1fr)_110px_20px] items-center gap-2';

const fmtHmsLive = (startIso: string, nowMs: number) => {
  const startMs = new Date(startIso).getTime();
  const sec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

const TimeCell: React.FC<{ startIso: string; endIso?: string | null; durationMin: number; ongoing?: boolean }> = ({ startIso, endIso, durationMin, ongoing }) => {
  const [now, setNow] = useState(() => Date.now());
  React.useEffect(() => {
    if (!ongoing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ongoing]);

  if (ongoing) {
    return (
      <div className="text-xs tabular-nums whitespace-nowrap truncate">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {fmtHm(startIso)} → pågår
        </span>
        <span className="text-emerald-700 dark:text-emerald-400"> · {fmtHmsLive(startIso, now)}</span>
      </div>
    );
  }
  const range = endIso ? `${fmtHm(startIso)}–${fmtHm(endIso)}` : `${fmtHm(startIso)} → pågår`;
  return (
    <div className="text-xs tabular-nums whitespace-nowrap truncate">
      <span className="font-semibold text-foreground">{range}</span>
      <span className="text-muted-foreground"> · {fmtDur(durationMin)}</span>
    </div>
  );
};


type RowAccent = 'project' | 'location' | 'journey' | 'gap';

const accentDot: Record<RowAccent, string> = {
  project: 'bg-emerald-500',
  location: 'bg-blue-500',
  journey: 'bg-slate-400',
  gap: 'bg-amber-400',
};

const accentBorder: Record<RowAccent, string> = {
  project: 'border-l-emerald-500',
  location: 'border-l-transparent',
  journey: 'border-l-transparent',
  gap: 'border-l-transparent',
};

const accentIconBg: Record<RowAccent, string> = {
  project: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  location: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  journey: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  gap: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const RowShell: React.FC<{
  accent: RowAccent;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  trashSlot?: React.ReactNode;
  children: React.ReactNode;
}> = ({ accent, active, expandable, expanded, onToggle, trashSlot, children }) => {
  return (
    <div
      className={`
        group relative
        ${GRID}
        px-2.5 py-1
        border-b border-border last:border-b-0
        border-l-4 ${active ? 'border-l-emerald-500' : accentBorder[accent]}
        ${active ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-300/60 dark:ring-emerald-700/40' : ''}
        ${expandable ? 'cursor-pointer hover:bg-muted/40' : ''}
        transition-colors
      `}
      onClick={expandable ? onToggle : undefined}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
    >
      {children}
      <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
        {trashSlot}
        {expandable
          ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
          : <span className="w-3.5" />}
      </div>
    </div>
  );
};


/* ------------------------------------------------------------------ */
/*  Inner technical events + extra badges (expand)                    */
/* ------------------------------------------------------------------ */

const badgeClass = (tone: 'ok' | 'warn' | 'info' | 'planned' | 'review') => {
  switch (tone) {
    case 'ok': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800';
    case 'warn': return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800';
    case 'review': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800';
    case 'planned': return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800';
    case 'info':
    default: return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700';
  }
};

const ExtraBadges: React.FC<{ badges: { label: string; tone: Parameters<typeof badgeClass>[0] }[] }> = ({ badges }) => {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-1.5 pt-0.5 pl-[200px]">
      {badges.map((b, i) => (
        <span key={i} className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border ${badgeClass(b.tone)}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
};

const InnerEvents: React.FC<{ block: DayBlock }> = ({ block }) => {
  if (block.innerEvents.length === 0) return null;
  return (
    <div className="bg-muted/30 border-b border-border px-3 py-1.5 pl-[200px]">
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {[...block.innerEvents]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map(e => (
            <li key={e.id} className="flex gap-2">
              <span className="tabular-nums shrink-0 w-12">{fmtHm(e.at)}</span>
              <span className="opacity-60 shrink-0 min-w-[120px]">{e.kind}</span>
              <span className="truncate">{typeof e.label === 'string' ? e.label : ''}</span>
            </li>
          ))}
      </ul>
    </div>
  );
};

/**
 * Debug-panel: visar varför en plats inte fick en upplöst adress.
 * Renderas i expand för okända/external endpoints så admin direkt ser
 * om koordinater saknas, lookup misslyckats, token saknas eller liknande.
 */
const isDebugRelevant = (p: PlaceLike): boolean => {
  if (!p) return false;
  // matched_internal med label = inget att felsöka
  if (p.lookupStatus === 'matched_internal' && p.label && !/okänd plats/i.test(p.label)) return false;
  return true;
};

const explainLookupError = (err: string | null | undefined): string | null => {
  if (!err) return null;
  if (err === 'mapbox_token_unavailable') return 'Mapbox-token saknas (edge function mapbox-token returnerade inget) — geocoding kan inte köras.';
  if (err === 'no_features') return 'Mapbox returnerade 0 features för koordinaten — punkten ligger troligen i obebott område.';
  if (err === 'no_label_resolvable') return 'Mapbox-svar saknade användbar plats/adress.';
  if (err === 'lookup_not_started') return 'Reverse-geocode-query har inte startat ännu.';
  if (err === 'lookup_failed') return 'Geocoding misslyckades utan specifik orsak.';
  if (err === 'missing_coords') return 'Saknar lat/lng — kan inte slå upp adress.';
  const httpMatch = err.match(/^mapbox_http_(\d+)$/);
  if (httpMatch) {
    const code = httpMatch[1];
    if (code === '401' || code === '403') return `Mapbox HTTP ${code} — token avvisad/utan behörighet (kontrollera mapbox-token-funktionen och token-scopes).`;
    if (code === '429') return 'Mapbox HTTP 429 — rate limit nådd.';
    return `Mapbox HTTP ${code}.`;
  }
  if (err.startsWith('exception:')) return `Undantag vid fetch: ${err.slice('exception:'.length)}`;
  return null;
};

const PlaceDebugPanel: React.FC<{
  title: string;
  place: PlaceLike & {
    lookupError?: string | null;
    tokenAvailable?: boolean | null;
    source?: string | null;
    cacheKey?: string | null;
    nearestKnownSite?: any;
    unmatchReason?: string | null;
    pingCount?: number | null;
    avgAccuracy?: number | null;
  };
}> = ({ title, place }) => {
  if (!place || !isDebugRelevant(place)) return null;
  const hasCoord = place.lat != null && place.lng != null;
  const mapUrl = buildMapUrl(place);
  const nearest = (place as any).nearestKnownSite ?? null;
  const distM = nearest?.distanceMeters ?? null;
  const errExplanation = explainLookupError(place.lookupError);
  const tokenAvail = place.tokenAvailable;
  const rows: Array<[string, React.ReactNode]> = [
    ['lat/lng', hasCoord ? `${place.lat!.toFixed(6)}, ${place.lng!.toFixed(6)}` : <span className="text-rose-600">saknas</span>],
    ['lookupStatus', String(place.lookupStatus ?? '—')],
    ['lookupError', place.lookupError
      ? <span className="text-rose-600">{place.lookupError}</span>
      : '—'],
    ...(errExplanation ? [['→ orsak', <span className="text-rose-600">{errExplanation}</span>] as [string, React.ReactNode]] : []),
    ['tokenAvailable', tokenAvail == null
      ? '—'
      : tokenAvail
        ? <span className="text-emerald-600">ja</span>
        : <span className="text-rose-600">nej (mapbox-token saknas)</span>],
    ['source', place.source ?? '—'],
    ['cacheKey', place.cacheKey ?? '—'],
    ['mapUrl', mapUrl
      ? <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">öppna<ExternalLink className="h-3 w-3" /></a>
      : '—'],
    ['nearestKnownSite', nearest ? `${nearest.name ?? nearest.id}` : '—'],
    ['distanceToNearestSite', distM != null ? `${Math.round(distM)} m (radie ${Math.round(nearest?.radiusMeters ?? 0)} m)` : '—'],
    ['unmatchReason', place.unmatchReason ?? '—'],
    ['pingCount', place.pingCount != null ? String(place.pingCount) : '—'],
    ['avgAccuracy', place.avgAccuracy != null ? `${Math.round(place.avgAccuracy)} m` : '—'],
  ];
  return (
    <div className="bg-muted/20 border-b border-border px-3 py-1.5 pl-[200px]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Plats-debug · {title}
        </div>
        {hasCoord && (
          <GeocodeTestButton lat={place.lat as number} lng={place.lng as number} />
        )}
      </div>
      <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="opacity-70">{k}</dt>
            <dd className="text-foreground/80 truncate">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

const GeocodeTestButton: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    tokenAvailable: boolean;
    source: string;
    label: string;
    unresolved: boolean;
    error: string | null;
    mapsUrl: string | null;
  }>(null);
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const { testReverseGeocode } = await import('@/hooks/useReverseGeocodeRich');
      const r = await testReverseGeocode(lat, lng);
      setResult({
        tokenAvailable: r.tokenAvailable,
        source: r.source,
        label: r.label,
        unresolved: r.unresolved,
        error: r.error,
        mapsUrl: r.mapsUrl,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="text-[10px] px-2 py-0.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
      >
        {busy ? 'Testar…' : 'Testa adressuppslag'}
      </button>
      {result && (
        <div className="text-[10px] text-muted-foreground bg-background border border-border rounded px-2 py-1 mt-1 w-[280px]">
          <div><span className="opacity-60">tokenAvailable:</span> {result.tokenAvailable ? 'ja' : <span className="text-rose-600">nej</span>}</div>
          <div><span className="opacity-60">source:</span> {result.source}</div>
          <div><span className="opacity-60">unresolved:</span> {result.unresolved ? <span className="text-rose-600">true</span> : 'false'}</div>
          <div><span className="opacity-60">label:</span> <span className="text-foreground/80">{result.label}</span></div>
          <div><span className="opacity-60">error:</span> {result.error ? <span className="text-rose-600">{result.error}</span> : '—'}</div>
          {result.mapsUrl && (
            <div><a href={result.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline">öppna karta</a></div>
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  PresenceRow                                                       */
/* ------------------------------------------------------------------ */

type StatusBadge = { label: string; tone: 'ok' | 'warn' | 'info' | 'planned' | 'review' };

const PresenceRow: React.FC<{ block: PresenceBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  const isProject = block.presenceKind === 'project';
  const accent: RowAccent = isProject ? 'project' : 'location';

  // Bygg alla badges
  // OBS: "TIMER SAKNAS" / "ARBETSDAG SAKNAS" / "SIGNAL TAPPAD" / "TIMER SEDAN"
  // är debug-information och får INTE visas som huvudstatus. De ingår i
  // den normaliserade DayHeaderPanel istället. Här visar vi bara aktiva
  // tillstånd och planerings-/granskningsmarkörer.
  const badges: StatusBadge[] = [];
  if (isProject) {
    // "TIMER AKTIV" tas bort från radnivå — aktiv timer visas i ActiveNowBanner
    // (en enda källa), inte parallellt på blockraderna.
    if (block.plannedStartIso) badges.push({ label: 'PLANERAD', tone: 'planned' });
    else if (block.sources.gpsVisit || block.arrivalIso) badges.push({ label: 'OPLANERAD', tone: 'info' });
    if (block.sources.gpsVisit || block.arrivalIso) badges.push({ label: 'GPS', tone: 'info' });
  }
  if (block.requiresReview) badges.push({ label: 'GRANSKA', tone: 'review' });

  // Default-status om inga badges
  if (badges.length === 0) {
    badges.push({ label: isProject ? 'PÅ PROJEKT' : block.strength === 'short_stop' ? 'KORT STOPP' : 'VISTELSE', tone: 'info' });
  }

  // Max 1 huvudbadge i raden, övriga visas i expand
  const headBadge = badges[0];
  const extraBadges = badges.slice(1);

  // Kompakt subtitle — endast viktigaste signalen.
  // "timer sedan ..." är borttagen från radnivå; aktiv timer-info visas i ActiveNowBanner.
  const subtitle = isProject
    ? (block.timeReport.present
        ? `tidrapport ${fmtHm(block.timeReport.startedIso)}${block.timeReport.closedIso ? `–${fmtHm(block.timeReport.closedIso)}` : ''}`
        : block.arrivalIso
          ? `GPS ${fmtHm(block.arrivalIso)}${block.departureIso ? `–${fmtHm(block.departureIso)}` : ''}`
          : 'projekt')
    : block.subtitle ?? '';

  const expandable = block.innerEvents.length > 0 || extraBadges.length > 0 || isDebugRelevant(block.resolvedPlace);

  const isOngoing = block.ongoing || block.timer.active;
  return (
    <>
      <RowShell
        accent={accent}
        active={isOngoing}
        expandable={expandable}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
        trashSlot={<RowExcludeButton blockId={block.id} label={block.title ?? 'Händelse'} />}
      >
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} ongoing={isOngoing} />

        {/* HÄNDELSE — en rad, inga wraps */}
        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot[accent]}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${accentIconBg[accent]}`}>
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <PlaceLabel place={block.resolvedPlace} fallback={block.title} className="font-semibold text-foreground truncate" />
          <PoiChip place={block.resolvedPlace as any} />
          {subtitle && (
            <>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground truncate">{subtitle}</span>
            </>
          )}
          {block.requiresReview && (
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
        </div>

        {/* STATUS — exakt 1 badge, ingen wrap */}
        <div className="flex items-center justify-end overflow-hidden">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap truncate ${badgeClass(headBadge.tone)}`}>
            {headBadge.label}
          </span>
        </div>
      </RowShell>
      {open && (
        <>
          <ExtraBadges badges={extraBadges} />
          <NearbyPoiList place={block.resolvedPlace as any} />
          <PlaceDebugPanel title="plats" place={block.resolvedPlace as any} />
          <InnerEvents block={block} />
        </>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  JourneyRow                                                        */
/* ------------------------------------------------------------------ */

const JourneyRow: React.FC<{ block: JourneyBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  const debugFrom = isDebugRelevant(block.fromPlace);
  const debugTo = isDebugRelevant(block.toPlace);
  const expandable = block.innerEvents.length > 0 || debugFrom || debugTo;
  return (
    <>
      <RowShell
        accent="journey"
        expandable={expandable}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
        trashSlot={<RowExcludeButton blockId={block.id} label={`Resa ${block.fromLabel ?? ''} → ${block.toLabel ?? ''}`} />}
      >
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} />

        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot.journey}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${accentIconBg.journey}`}>
            <Car className="h-3.5 w-3.5" />
          </span>
          <PlaceLabel place={block.fromPlace} fallback={block.fromLabel} className="font-medium text-foreground truncate" segmentStartIso={block.startIso} segmentEndIso={block.endIso} />
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <PlaceLabel place={block.toPlace} fallback={block.toLabel} className="font-medium text-foreground truncate" segmentStartIso={block.startIso} segmentEndIso={block.endIso} />
        </div>

        <div className="flex items-center justify-end overflow-hidden">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
            block.uncertain ? badgeClass('review') : badgeClass('info')
          }`}>
            {block.uncertain ? 'MÖJLIG' : 'RESA'}
          </span>
        </div>
      </RowShell>
      {open && (
        <>
          <PlaceDebugPanel title="från" place={block.fromPlace as any} />
          <PlaceDebugPanel title="till" place={block.toPlace as any} />
          <InnerEvents block={block} />
        </>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  GapRow                                                            */
/* ------------------------------------------------------------------ */

const GAP_REASON_LABEL: Record<GapReason, string> = {
  no_visit_generated: 'Ingen vistelse genererades',
  filtered_as_too_short: 'För kort — filtrerades bort',
  swallowed_by_travel: 'Slukat av förflyttning',
  target_unknown: 'Okänd destination',
  merged_into_previous: 'Slogs ihop med föregående',
  raw_only_only: 'Endast tekniska events',
  no_signal: 'Ingen GPS-signal',
};

const GapRow: React.FC<{ block: GapBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  // Saknad GPS-signal är INTE ett tidsglapp — visas som passiv signal-status
  // utan "GRANSKA"-badge och utan amber accent.
  const isSignalOnly = block.reason === 'no_signal';
  const lastSignal = formatStockholmHm(block.startIso);
  return (
    <>
      <RowShell
        accent={isSignalOnly ? 'location' : 'gap'}
        expandable={block.innerEvents.length > 0}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
        trashSlot={isSignalOnly ? null : <RowExcludeButton blockId={block.id} label={block.expectedLabel ?? 'Glapp'} />}
      >
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} />

        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${isSignalOnly ? 'bg-muted-foreground/40' : accentDot.gap}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${isSignalOnly ? 'bg-muted text-muted-foreground' : accentIconBg.gap}`}>
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
          {isSignalOnly ? (
            <>
              <span className="font-medium text-muted-foreground truncate">Signal saknas</span>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground truncate">Senaste signal {lastSignal} · arbetsdag pågår</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground truncate">{block.expectedLabel ?? 'Plats okänd'}</span>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground truncate">{GAP_REASON_LABEL[block.reason]}</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-end overflow-hidden">
          {!isSignalOnly && (
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${badgeClass('review')}`}>
              GRANSKA
            </span>
          )}
        </div>
      </RowShell>
      {open && <InnerEvents block={block} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

export interface DayBlockTimelineProps {
  blocks: DayBlock[];
  excludedKeys?: Set<string>;
  onExcludeBlock?: (blockId: string) => void | Promise<void>;
  canExclude?: boolean;
  staffId?: string;
  date?: string;
}

export const DayBlockTimeline: React.FC<DayBlockTimelineProps> = ({ blocks, excludedKeys, onExcludeBlock, canExclude, staffId, date }) => {
  const visible = excludedKeys && excludedKeys.size > 0
    ? blocks.filter(b => !excludedKeys.has(b.id))
    : blocks;
  const hiddenCount = blocks.length - visible.length;
  if (visible.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-4 text-center">
        {hiddenCount > 0 ? `${hiddenCount} rad${hiddenCount === 1 ? '' : 'er'} dolda av admin.` : 'Inga händelser registrerade för dagen.'}
      </div>
    );
  }
  return (
    <ExcludeContext.Provider value={{ canExclude: !!canExclude && !!onExcludeBlock, onExclude: onExcludeBlock }}>
      <MapContext.Provider value={{ staffId, date }}>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className={`${GRID} px-2.5 py-1.5 bg-muted/40 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>
            <div className="pl-1">Tid</div>
            <div>Händelse</div>
            <div className="text-right">Status</div>
            <div />
          </div>
          {visible.map(b =>
            b.kind === 'presence' ? <PresenceRow key={b.id} block={b} />
            : b.kind === 'journey' ? <JourneyRow key={b.id} block={b} />
            : <GapRow key={b.id} block={b} />
          )}
          {hiddenCount > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-t border-border bg-muted/20">
              {hiddenCount} rad{hiddenCount === 1 ? '' : 'er'} dolda av admin (manuellt exkluderade).
            </div>
          )}
        </div>
      </MapContext.Provider>
    </ExcludeContext.Provider>
  );
};

export default DayBlockTimeline;
