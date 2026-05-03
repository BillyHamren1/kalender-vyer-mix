import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, ChevronDown, ChevronRight, LogIn, LogOut, Car } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { useDayKnownSites } from '@/hooks/useDayKnownSites';
import { buildPlaceVisits, buildDayTimeline, type PlaceVisit, type TravelGap } from '@/lib/staff/pingPlaceSegments';
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

const fmtSec = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm:ss'); } catch { return '—'; }
};

const fmtDur = (min: number) => {
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/** Visar pings inom en visit som expanderas. Reverse-geocodar koordinater. */
const VisitPingsRows: React.FC<{
  pings: Ping[];
  leadingCells: number;
  contentCols: number;
  onPick: (label: string, coords: { lat: number; lng: number }) => void;
}> = ({ pings, leadingCells, contentCols, onPick }) => {
  const coords = useMemo(() => pings.map(p => ({ lat: p.lat, lng: p.lng })), [pings]);
  const labels = useReverseGeocode(coords);
  return (
    <>
      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40 bg-muted/20">
        {Array.from({ length: leadingCells + 1 }).map((_, i) => (
          <th key={`ph-${i}`} className="px-2 py-1" />
        ))}
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Tid</th>
        <th className="text-left font-semibold px-2 py-1" colSpan={Math.max(1, contentCols - 4)}>Adress / koordinat</th>
        <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">Acc</th>
      </tr>
      {pings.map((p, i) => {
        const label = labels[i] ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
        return (
          <tr key={`ping-${i}-${p.recorded_at}`} className="border-b border-border/10 text-[11px] bg-background/40">
            {Array.from({ length: leadingCells + 1 }).map((_, idx) => (
              <td key={`pp-${idx}`} className="px-2 py-0.5" />
            ))}
            <td className="px-2 py-0.5 tabular-nums font-mono text-foreground whitespace-nowrap align-top">
              {fmtSec(p.recorded_at)}
            </td>
            <td className="px-2 py-0.5 align-top" colSpan={Math.max(1, contentCols - 4)}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPick(label, { lat: p.lat, lng: p.lng }); }}
                className="text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1"
                title={`Visa ${label} på karta`}
              >
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{label}</span>
                <span className="font-mono text-muted-foreground/70 ml-1">
                  ({p.lat.toFixed(5)}, {p.lng.toFixed(5)})
                </span>
              </button>
            </td>
            <td className="px-2 py-0.5 tabular-nums text-right text-muted-foreground align-top whitespace-nowrap">
              {p.accuracy != null ? `${Math.round(p.accuracy)}m` : '—'}
            </td>
          </tr>
        );
      })}
    </>
  );
};

/**
 * Render-only komponent. All platslogik lever i `pingPlaceSegments.ts`.
 * Här gör vi BARA tre saker:
 *   1. hämta råpingar
 *   2. be motorn bygga vistelser
 *   3. visa dem (label = känd plats > reverse-geocode > koordinat)
 */
export const GpsStopsRows: React.FC<Props> = ({
  staffId, date, leadingCells = 1, totalCols = 8,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState<
    | null
    | { address: string; coords: { lat: number; lng: number } }
  >(null);

  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, true);
  const { knownSites } = useDayKnownSites(staffId, date, true);

  const visits: PlaceVisit[] = useMemo(
    () => buildPlaceVisits(pings, knownSites),
    [pings, knownSites],
  );

  const timeline = useMemo(() => buildDayTimeline(pings, visits), [pings, visits]);

  // Reverse-geocode endast okända vistelser (kända platser har redan namn).
  const geocodeTargets = useMemo(
    () => visits.map(v => (v.knownSite ? null : v.centre)),
    [visits],
  );
  const geoLabels = useReverseGeocode(geocodeTargets);

  type Row =
    | { kind: 'visit'; key: string; start: string; end: string; durationMin: number; pingCount: number; coords: { lat: number; lng: number }; label: string; pings: Ping[]; mismatch: boolean }
    | { kind: 'travel'; key: string; start: string; end: string; durationMin: number; pings: Ping[]; fromLabel: string; toLabel: string };

  const rows: Row[] = useMemo(() => {
    const visitRows = visits.map((v, i): Row => {
      // Exakt medlemskap från motorn — INTE tidsfilter.
      // Se mem://constraints/gps-visit-exact-ping-membership-v1.
      const visitPings = v.pings;
      const offending = visitPings.filter(
        p => haversineMeters(v.centre, { lat: p.lat, lng: p.lng }) > 500,
      );
      if (offending.length > 0) {
        // eslint-disable-next-line no-console
        console.error('GPS VISIT MISMATCH', {
          placeKey: v.placeKey,
          centre: v.centre,
          offendingCount: offending.length,
          example: offending[0],
        });
      }
      const baseLabel = v.knownSite
        ? v.knownSite.name
        : (geoLabels[i] ?? `${v.centre.lat.toFixed(4)}, ${v.centre.lng.toFixed(4)}`);
      return {
        kind: 'visit',
        key: `${v.placeKey}-${v.start}`,
        start: v.start,
        end: v.end,
        durationMin: v.durationMin,
        pingCount: visitPings.length,
        coords: v.centre,
        label: offending.length > 0 ? `${baseLabel} — GPS mismatch (invalid segment)` : baseLabel,
        pings: visitPings,
        mismatch: offending.length > 0,
      };
    });

    const labelFor = (v: PlaceVisit, i: number) => v.knownSite?.name ?? geoLabels[i] ?? 'okänd plats';
    const interleaved: Row[] = [];
    for (let i = 0; i < visitRows.length; i++) {
      interleaved.push(visitRows[i]);
      const tr: TravelGap | undefined = timeline.travels[i];
      if (tr) {
        interleaved.push({
          kind: 'travel',
          key: tr.key,
          start: tr.start,
          end: tr.end,
          durationMin: tr.durationMin,
          pings: tr.pings,
          fromLabel: labelFor(tr.from, visits.indexOf(tr.from)),
          toLabel: labelFor(tr.to, visits.indexOf(tr.to)),
        });
      }
    }
    return interleaved;
  }, [visits, geoLabels, pings, timeline.travels]);

  const contentCols = totalCols - leadingCells;

  if (isLoading || rows.length === 0) {
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

  const totalVisitMin = rows.reduce((sum, r) => sum + (r.kind === 'visit' ? r.durationMin : 0), 0);
  const visitCount = rows.filter(r => r.kind === 'visit').length;
  const travelCount = rows.filter(r => r.kind === 'travel').length;

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
            <span className="font-medium">Faktiska besök & förflyttningar (GPS)</span>
            <span className="tabular-nums text-muted-foreground/80">
              ({visitCount} adress{visitCount === 1 ? '' : 'er'} · {travelCount} resa{travelCount === 1 ? '' : 'r'} · {fmtDur(totalVisitMin)} på plats)
            </span>
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
          <th className="px-2 py-1" />
          <th className="px-2 py-1 w-6" />
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Ankom</th>
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Lämnade</th>
          <th className="text-left font-semibold px-2 py-1" colSpan={Math.max(1, contentCols - 5)}>Adress / Förflyttning</th>
          <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">Pings</th>
          <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">Tid</th>
        </tr>
      )}

      {expanded && rows.map((r) => {
        const isOpen = expandedVisit === r.key;
        if (r.kind === 'travel') {
          const pingsCount = r.pings.length;
          return (
            <React.Fragment key={r.key}>
              <tr
                className="border-b border-border/20 text-xs bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer"
                onClick={() => setExpandedVisit(isOpen ? null : r.key)}
              >
                {Array.from({ length: leadingCells }).map((_, idx) => (
                  <td key={`pad-${idx}`} className="px-2 py-1" />
                ))}
                <td className="px-2 py-1 align-top w-6">
                  {pingsCount > 0 ? (isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />) : null}
                </td>
                <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap align-top">
                  {fmt(r.start)}
                </td>
                <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap align-top">
                  {fmt(r.end)}
                </td>
                <td className="px-2 py-1 align-top text-muted-foreground italic" colSpan={Math.max(1, contentCols - 5)}>
                  <span className="inline-flex items-center gap-1.5">
                    <Car className="h-3 w-3 text-amber-600" />
                    Förflyttning: {r.fromLabel} → {r.toLabel}
                  </span>
                </td>
                <td className="px-2 py-1 tabular-nums text-right text-muted-foreground align-top whitespace-nowrap">
                  {pingsCount}
                </td>
                <td className="px-2 py-1 tabular-nums text-muted-foreground italic whitespace-nowrap text-right align-top">
                  {fmtDur(r.durationMin)}
                </td>
              </tr>
              {isOpen && pingsCount > 0 && (
                <VisitPingsRows
                  pings={r.pings}
                  leadingCells={leadingCells}
                  contentCols={contentCols}
                  onPick={(label, coords) => setMapTarget({ address: label, coords })}
                />
              )}
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={r.key}>
            <tr
              className="border-b border-border/20 text-xs bg-muted/5 hover:bg-muted/15 cursor-pointer"
              onClick={() => setExpandedVisit(isOpen ? null : r.key)}
            >
              {Array.from({ length: leadingCells }).map((_, idx) => (
                <td key={`pad-${idx}`} className="px-2 py-1" />
              ))}
              <td className="px-2 py-1 align-top w-6">
                {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </td>
              <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
                <span className="inline-flex items-center gap-1">
                  <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  {fmt(r.start)}
                </span>
              </td>
              <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
                <span className="inline-flex items-center gap-1">
                  <LogOut className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                  {fmt(r.end)}
                </span>
              </td>
              <td className="px-2 py-1 align-top" colSpan={Math.max(1, contentCols - 5)}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMapTarget({ address: r.label, coords: r.coords });
                  }}
                  className="text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate inline-flex items-center gap-1"
                  title={`Visa ${r.label} på karta`}
                >
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {r.label}
                </button>
              </td>
              <td className="px-2 py-1 tabular-nums text-right text-muted-foreground align-top whitespace-nowrap">
                {r.pingCount}
              </td>
              <td className="px-2 py-1 tabular-nums font-semibold text-foreground whitespace-nowrap text-right align-top">
                {fmtDur(r.durationMin)}
              </td>
            </tr>
            {isOpen && r.pings.length > 0 && (
              <VisitPingsRows
                pings={r.pings}
                leadingCells={leadingCells}
                contentCols={contentCols}
                onPick={(label, coords) => setMapTarget({ address: label, coords })}
              />
            )}
          </React.Fragment>
        );
      })}

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
