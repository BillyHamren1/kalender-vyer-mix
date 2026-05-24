import { Fragment, useMemo, useState } from 'react';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

interface Props {
  visits: PlaceVisit[];
  /** Visas i den expanderade vy-tabellen ovanför listan. Sätt null för att dölja. */
  title?: string | null;
  /** Kompakt variant används inuti veckopanelens expanderade dag. */
  compact?: boolean;
  emptyText?: string;
}

function fmtDur(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

function kindLabel(id: string): string {
  if (id.startsWith('loc:')) return 'Plats';
  if (id.startsWith('large:')) return 'Stort projekt';
  if (id.startsWith('project:')) return 'Projekt';
  if (id.startsWith('booking:')) return 'Bokning';
  return '—';
}

/**
 * GeofenceVisitRows — delad presentation av geofence-besök.
 * Används både i veckopanelens expanderade dag och som dagdetalj.
 */
export function GeofenceVisitRows({ visits, title, compact = false, emptyText }: Props) {
  const sorted = useMemo(
    () => [...visits].sort((a, b) => a.start.localeCompare(b.start)),
    [visits],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!sorted.length) {
    return (
      <div className={compact ? 'px-3 py-4 text-center text-[11px] text-muted-foreground' : 'px-3 py-8 text-center text-sm text-muted-foreground'}>
        {emptyText ?? 'Inga geofence-besök.'}
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'planning-card overflow-hidden'}>
      {title !== null && !compact && (
        <div className="px-4 py-3 border-b border-[hsl(270_20%_90%)] flex items-center justify-between bg-[hsl(270_35%_98%)]">
          <div className="flex items-center gap-2">
            <span className="planning-section-title">{title ?? 'Geofence-besök'}</span>
            <span className="planning-badge">{sorted.length}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Klicka på en rad för att se alla pings</span>
        </div>
      )}
      <div className={compact ? 'overflow-auto' : 'max-h-[60vh] overflow-auto'}>
        <table className={compact ? 'w-full text-[11.5px]' : 'w-full text-xs'}>
          <thead className={compact
            ? 'bg-[hsl(270_35%_97%)] border-b border-[hsl(270_18%_92%)]'
            : 'sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[hsl(270_18%_92%)]'}
          >
            <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className={compact ? 'px-2 py-1.5 font-semibold w-4' : 'px-3 py-2 font-semibold w-6'}></th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Plats</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Typ</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>In</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Ut</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold text-right' : 'px-3 py-2 font-semibold'}>Tid</th>
              {!compact && <th className="px-3 py-2 font-semibold text-right">Pings</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const id = v.knownSite?.id ?? '';
              const kind = kindLabel(id);
              const isOutside = v.subKind === 'outside_geo';
              const rowKey = `gv-${v.placeKey}-${v.start}`;
              const isOpen = expandedKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                    className={`border-t border-[hsl(270_18%_94%)] cursor-pointer transition-colors ${isOpen ? 'bg-[hsl(270_45%_96%)]' : 'hover:bg-[hsl(270_35%_98%)]'}`}
                  >
                    <td className={compact ? 'px-2 py-1.5 text-muted-foreground tabular-nums select-none' : 'px-3 py-2 text-muted-foreground tabular-nums select-none'}>
                      {isOpen ? '▾' : '▸'}
                    </td>
                    <td className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
                      <span className="font-medium text-foreground/90 truncate">{v.knownSite?.name ?? '—'}</span>
                      {isOutside && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">· Utanför geo</span>
                      )}
                    </td>
                    <td className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
                      <span className="planning-chip">{kind}</span>
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-mono tabular-nums text-foreground/80' : 'px-3 py-2 font-mono tabular-nums text-foreground/80'}>
                      {formatStockholmHms(v.start)}
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-mono tabular-nums text-foreground/80' : 'px-3 py-2 font-mono tabular-nums text-foreground/80'}>
                      {formatStockholmHms(v.end)}
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-medium tabular-nums text-right' : 'px-3 py-2 font-medium tabular-nums'}>
                      {fmtDur(v.durationMin)}
                    </td>
                    {!compact && (
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{v.pingCount}</td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="bg-[hsl(270_45%_98%)]">
                      <td colSpan={compact ? 6 : 7} className="px-0 py-0">
                        <VisitPingsDetail visit={v} compact={compact} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VisitPingsDetail({ visit, compact }: { visit: PlaceVisit; compact: boolean }) {
  const pings = visit.pings ?? [];
  return (
    <div className={compact ? 'px-3 py-2 border-t border-[hsl(270_25%_90%)]' : 'px-6 py-3 border-t border-[hsl(270_25%_90%)]'}>
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2 flex items-center gap-2">
        <span>Alla pings för detta besök</span>
        <span className="planning-badge">{pings.length}</span>
      </div>
      <div className="max-h-[30vh] overflow-auto rounded border border-[hsl(270_20%_92%)] bg-white">
        <table className="w-full text-[10.5px]">
          <thead className="sticky top-0 bg-[hsl(270_35%_97%)] text-left text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-semibold w-8">#</th>
              <th className="px-2 py-1 font-semibold">Tid</th>
              <th className="px-2 py-1 font-semibold">Lat</th>
              <th className="px-2 py-1 font-semibold">Lng</th>
              <th className="px-2 py-1 font-semibold text-right">Acc</th>
              <th className="px-2 py-1 font-semibold">Karta</th>
            </tr>
          </thead>
          <tbody>
            {pings.map((p, idx) => (
              <tr key={`${p.recorded_at}-${idx}`} className="border-t border-[hsl(270_18%_95%)] hover:bg-[hsl(270_35%_98%)]">
                <td className="px-2 py-1 tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{formatStockholmHms(p.recorded_at)}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{p.lat.toFixed(6)}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{p.lng.toFixed(6)}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {p.accuracy != null ? Math.round(p.accuracy) : '—'}
                </td>
                <td className="px-2 py-1">
                  <a
                    href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Öppna
                  </a>
                </td>
              </tr>
            ))}
            {!pings.length && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Inga pings registrerade.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
