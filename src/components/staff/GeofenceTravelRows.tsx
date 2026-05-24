import { Fragment, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import type { TravelGap } from '@/lib/staff/pingPlaceSegments';

interface Props {
  travels: TravelGap[];
  /** Visas i header. Sätt null för att dölja headern. */
  title?: string | null;
  compact?: boolean;
  emptyText?: string;
}

function fmtDur(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

function kindLabel(id: string | undefined): string {
  if (!id) return '—';
  if (id.startsWith('loc:')) return 'Plats';
  if (id.startsWith('large:')) return 'Stort projekt';
  if (id.startsWith('project:')) return 'Projekt';
  if (id.startsWith('booking:')) return 'Bokning';
  return '—';
}

/**
 * GeofenceTravelRows — listar förflyttningar (resor) mellan synliga geofence-besök.
 * Visar Från → Till, start/slut, varaktighet och pings. Länken till "projekt" består
 * av besökens knownSite (samma kopplingsmodell som besökslistan).
 */
export function GeofenceTravelRows({ travels, title, compact = false, emptyText }: Props) {
  const sorted = useMemo(
    () => [...travels].sort((a, b) => a.start.localeCompare(b.start)),
    [travels],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!sorted.length) {
    return (
      <div className={compact ? 'px-3 py-3 text-center text-[11px] text-muted-foreground' : 'px-3 py-8 text-center text-sm text-muted-foreground'}>
        {emptyText ?? 'Inga resor mellan besöken.'}
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'planning-card overflow-hidden'}>
      {title !== null && !compact && (
        <div className="px-4 py-3 border-b border-[hsl(270_20%_90%)] flex items-center justify-between bg-[hsl(270_35%_98%)]">
          <div className="flex items-center gap-2">
            <span className="planning-section-title">{title ?? 'Resor'}</span>
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
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Från → Till</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Typ</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Avgick</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold' : 'px-3 py-2 font-semibold'}>Anlände</th>
              <th className={compact ? 'px-2 py-1.5 font-semibold text-right' : 'px-3 py-2 font-semibold'}>Tid</th>
              {!compact && <th className="px-3 py-2 font-semibold text-right">Pings</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const fromName = t.from.knownSite?.name ?? '—';
              const toName = t.to.knownSite?.name ?? '—';
              const toKind = kindLabel(t.to.knownSite?.id);
              const rowKey = `tr-${t.key}-${t.start}`;
              const isOpen = expandedKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                    className={`border-t border-[hsl(270_18%_94%)] cursor-pointer transition-colors ${isOpen ? 'bg-[hsl(35_80%_94%)]' : 'hover:bg-[hsl(35_80%_97%)]'}`}
                  >
                    <td className={compact ? 'px-2 py-1.5 text-muted-foreground tabular-nums select-none' : 'px-3 py-2 text-muted-foreground tabular-nums select-none'}>
                      {isOpen ? '▾' : '▸'}
                    </td>
                    <td className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
                      <span className="inline-flex items-center gap-1 text-foreground/90">
                        <span className="truncate">{fromName}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                        <span className="font-medium truncate">{toName}</span>
                      </span>
                    </td>
                    <td className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
                      <span className="planning-chip">{toKind}</span>
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-mono tabular-nums text-foreground/80' : 'px-3 py-2 font-mono tabular-nums text-foreground/80'}>
                      {formatStockholmHms(t.start)}
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-mono tabular-nums text-foreground/80' : 'px-3 py-2 font-mono tabular-nums text-foreground/80'}>
                      {formatStockholmHms(t.end)}
                    </td>
                    <td className={compact ? 'px-2 py-1.5 font-medium tabular-nums text-right' : 'px-3 py-2 font-medium tabular-nums'}>
                      {fmtDur(t.durationMin)}
                    </td>
                    {!compact && (
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.pings.length}</td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="bg-[hsl(35_80%_97%)]">
                      <td colSpan={compact ? 6 : 7} className="px-0 py-0">
                        <TravelPingsDetail travel={t} compact={compact} />
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

function TravelPingsDetail({ travel, compact }: { travel: TravelGap; compact: boolean }) {
  const pings = travel.pings ?? [];
  return (
    <div className={compact ? 'px-3 py-2 border-t border-[hsl(35_60%_85%)]' : 'px-6 py-3 border-t border-[hsl(35_60%_85%)]'}>
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2 flex items-center gap-2">
        <span>Pings under förflyttningen</span>
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
              <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Inga pings i gapet (GPS tystnade).</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
