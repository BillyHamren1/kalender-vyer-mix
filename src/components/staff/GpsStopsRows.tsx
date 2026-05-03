import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, ChevronDown, ChevronRight, LogIn, LogOut } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import { haversineMeters, type Ping } from '@/lib/staff/movementDetection';
import { AddressMapDialog } from './AddressMapDialog';

interface Props {
  staffId: string;
  date: string;
  leadingCells?: number;
  totalCols?: number;
}

const fmt = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

const fmtDur = (min: number) => {
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

interface KnownSiteHit {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface PingPlace {
  ping: Ping;
  /** Stable key per fysisk plats. Site-id om känd, annars grov koordinatcell. */
  key: string;
  /** Human label om vi har en känd site, annars null tills geocoden svarat. */
  knownLabel: string | null;
  /** Site som matchade, om någon. */
  site: KnownSiteHit | null;
}

const COORD_CELL_DECIMALS = 3; // ~110m grid

const coordCellKey = (lat: number, lng: number) =>
  `cell:${lat.toFixed(COORD_CELL_DECIMALS)},${lng.toFixed(COORD_CELL_DECIMALS)}`;
  const m = key.match(/^cell:(-?\d+\.\d+),(-?\d+\.\d+)$/);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
};

/**
 * Hitta närmsta kända plats inom dess radius (eller default 200m).
 */
function matchKnownSite(
  ping: Ping,
  sites: Array<KnownSiteHit & { radiusMeters: number }>,
): KnownSiteHit | null {
  let best: { site: KnownSiteHit; dist: number } | null = null;
  for (const s of sites) {
    const d = haversineMeters({ lat: s.lat, lng: s.lng }, { lat: ping.lat, lng: ping.lng });
    if (d <= s.radiusMeters && (!best || d < best.dist)) {
      best = { site: { id: s.id, name: s.name, lat: s.lat, lng: s.lng }, dist: d };
    }
  }
  return best?.site ?? null;
}

interface PlaceSegment {
  key: string;
  label: string | null;          // resolved later if needed
  knownSite: KnownSiteHit | null;
  pings: Ping[];
  centre: { lat: number; lng: number };
}

/**
 * Segmentera kronologiskt: efterföljande pings med samma key → samma vistelse.
 * Tål enstaka avvikande ping (GPS-spike) genom CONFIRM-fönster.
 */
function segmentByPlace(places: PingPlace[]): PlaceSegment[] {
  if (places.length === 0) return [];
  const CONFIRM = 2;

  const segments: PlaceSegment[] = [];
  let curKey = places[0].key;
  let curBuf: PingPlace[] = [places[0]];
  let pendingOther: PingPlace[] = [];

  const flush = () => {
    const lats = curBuf.map(p => p.ping.lat);
    const lngs = curBuf.map(p => p.ping.lng);
    const centre = {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
    };
    const known = curBuf.find(p => p.site)?.site ?? null;
    segments.push({
      key: curKey,
      label: known ? known.name : null,
      knownSite: known,
      pings: curBuf.map(p => p.ping),
      centre: known ? { lat: known.lat, lng: known.lng } : centre,
    });
  };

  for (let i = 1; i < places.length; i++) {
    const p = places[i];
    if (p.key === curKey) {
      // Tillbaka — eventuella pendingOther var brus, släng dem inte ur tids­linjen
      if (pendingOther.length > 0) {
        curBuf.push(...pendingOther);
        pendingOther = [];
      }
      curBuf.push(p);
      continue;
    }
    pendingOther.push(p);
    // Bekräfta nytt place om de senaste CONFIRM pingsen alla har samma nya key
    const tail = pendingOther.slice(-CONFIRM);
    if (tail.length >= CONFIRM && tail.every(t => t.key === tail[0].key)) {
      flush();
      curKey = tail[0].key;
      curBuf = [...tail];
      pendingOther = [];
    }
  }
  // Hängande pendingOther i slutet — fördela till curBuf om de inte hann bekräftas
  if (pendingOther.length > 0) curBuf.push(...pendingOther);
  flush();
  return segments;
}

export const GpsStopsRows: React.FC<Props> = ({
  staffId, date, leadingCells = 1, totalCols = 8,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mapTarget, setMapTarget] = useState<
    | null
    | { address: string; coords: { lat: number; lng: number } }
  >(null);

  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, true);
  const { data: knownSites = [] } = useOrganizationLocations();

  // 1. Etikettera VARJE ping först — innan någon klustring eller geocodning.
  //    Känd plats vinner alltid över koordinatcell.
  const labelledPings: PingPlace[] = useMemo(() => {
    if (pings.length === 0) return [];
    const sorted = [...pings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    return sorted.map(p => {
      const site = matchKnownSite(p, knownSites);
      if (site) {
        return { ping: p, key: `site:${site.id}`, knownLabel: site.name, site };
      }
      return {
        ping: p,
        key: coordCellKey(p.lat, p.lng),
        knownLabel: null,
        site: null,
      };
    });
  }, [pings, knownSites]);

  // 2. Segmentera kronologiskt på platsnyckel (ping-först, ej centroid-först).
  const rawSegments = useMemo(() => segmentByPlace(labelledPings), [labelledPings]);

  // 3. Filtrera bort för korta vistelser (<5 min). Kortare GPS-blink är inte
  //    ett besök — det är passage.
  const segments = useMemo(() => {
    return rawSegments
      .map(s => {
        const start = s.pings[0].recorded_at;
        const end = s.pings[s.pings.length - 1].recorded_at;
        const durationMin = Math.max(0, Math.round(
          (new Date(end).getTime() - new Date(start).getTime()) / 60000,
        ));
        return { ...s, start, end, durationMin };
      })
      .filter(s => s.durationMin >= 5);
  }, [rawSegments]);

  // 4. Reverse-geocode endast okända segment (de som inte matchade en känd site).
  //    Vi geocodar segmentets faktiska medelpunkt — inte en gissad centroid över
  //    blandade pings, för segmenten är redan enpunkts-platser.
  const geocodeTargets = useMemo(
    () => segments.map(s => (s.knownSite ? null : s.centre)),
    [segments],
  );
  const geoAddrs = useReverseGeocode(geocodeTargets);

  // 5. Bygg slutliga rader. Slå ihop direkt angränsande rader med EXAKT samma
  //    slutgiltiga etikett (skydd mot att två cellnycklar geocodats till samma
  //    adress-text för samma fysiska plats).
  const stops = useMemo(() => {
    type Row = {
      start: string;
      end: string;
      durationMin: number;
      label: string;
      coords: { lat: number; lng: number };
      pingCount: number;
    };
    const rows: Row[] = segments.map((s, i) => ({
      start: s.start,
      end: s.end,
      durationMin: s.durationMin,
      label: s.knownSite
        ? s.knownSite.name
        : (geoAddrs[i] ?? `${s.centre.lat.toFixed(4)}, ${s.centre.lng.toFixed(4)}`),
      coords: s.centre,
      pingCount: s.pings.length,
    }));

    if (rows.length <= 1) return rows;
    const merged: Row[] = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      const last = merged[merged.length - 1];
      const next = rows[i];
      if (last.label.trim().toLowerCase() === next.label.trim().toLowerCase()) {
        const totalPings = last.pingCount + next.pingCount;
        merged[merged.length - 1] = {
          start: last.start,
          end: next.end,
          durationMin: Math.max(0, Math.round(
            (new Date(next.end).getTime() - new Date(last.start).getTime()) / 60000,
          )),
          label: last.label,
          coords: {
            lat: (last.coords.lat * last.pingCount + next.coords.lat * next.pingCount) / totalPings,
            lng: (last.coords.lng * last.pingCount + next.coords.lng * next.pingCount) / totalPings,
          },
          pingCount: totalPings,
        };
      } else {
        merged.push(next);
      }
    }
    return merged;
  }, [segments, geoAddrs]);

  const contentCols = totalCols - leadingCells;

  if (isLoading || stops.length === 0) {
    return (
      <tr className="border-b border-border/40 bg-muted/5 text-xs">
        {Array.from({ length: leadingCells }).map((_, i) => (
          <td key={`pad-${i}`} className="px-2 py-1" />
        ))}
        <td colSpan={contentCols} className="px-2 py-1 text-muted-foreground italic">
          {isLoading ? 'Hämtar GPS-stopp…' : 'Inga GPS-stopp registrerade.'}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b border-border/30 bg-muted/10 text-xs">
        <td className="px-2 py-1" />
        <td colSpan={contentCols} className="px-2 py-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(s => !s); }}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <MapPin className="h-3 w-3" />
            <span className="font-medium">Faktiska besök (GPS-pingar)</span>
            <span className="tabular-nums text-muted-foreground/80">
              ({stops.length} adress{stops.length === 1 ? '' : 'er'} · {fmtDur(stops.reduce((sum, s) => sum + s.durationMin, 0))} totalt)
            </span>
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
          <th className="px-2 py-1" />
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Ankom</th>
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Lämnade</th>
          <th className="text-left font-semibold px-2 py-1" colSpan={contentCols - 3}>Adress</th>
          <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">På plats</th>
        </tr>
      )}

      {expanded && stops.map((s, i) => (
        <tr
          key={`stop-${i}`}
          className="border-b border-border/20 text-xs bg-muted/5 hover:bg-muted/15"
        >
          {Array.from({ length: leadingCells }).map((_, idx) => (
            <td key={`pad-${idx}`} className="px-2 py-1" />
          ))}
          <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
            <span className="inline-flex items-center gap-1">
              <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {fmt(s.start)}
            </span>
          </td>
          <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
            <span className="inline-flex items-center gap-1">
              <LogOut className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              {fmt(s.end)}
            </span>
          </td>
          <td className="px-2 py-1 align-top" colSpan={contentCols - 3}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMapTarget({ address: s.label, coords: s.coords });
              }}
              className="text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate inline-flex items-center gap-1"
              title={`Visa ${s.label} på karta`}
            >
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {s.label}
            </button>
          </td>
          <td className="px-2 py-1 tabular-nums font-semibold text-foreground whitespace-nowrap text-right align-top">
            {fmtDur(s.durationMin)}
          </td>
        </tr>
      ))}

      {mapTarget && (
        <tr style={{ display: 'none' }}>
          <td>
            <AddressMapDialog
              open={!!mapTarget}
              onOpenChange={(o) => { if (!o) setMapTarget(null); }}
              address={mapTarget.address}
              coords={mapTarget.coords}
              staffId={staffId}
              date={date}
            />
          </td>
        </tr>
      )}
    </>
  );
};
