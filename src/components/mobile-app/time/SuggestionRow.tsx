/**
 * SuggestionRow — visar GPS-baserat tidsförslag för en dag utan inskickad
 * rapport. Speglar admin GPS-vyn och låter användaren godkänna det direkt
 * eller öppna detaljvyn för manuell justering.
 *
 * Ingen lokal tolkning eller summering — all data kommer från
 * `get-mobile-staff-gps-day-suggestion` via useStaffGpsWeekSuggestion.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Check, ChevronRight, Loader2, Map as MapIcon, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { useSubmitStaffDayReport } from '@/hooks/useSubmitStaffDayReport';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import type { GpsDaySuggestion } from '@/hooks/useStaffGpsWeekSuggestion';
import { toast } from '@/hooks/use-toast';

interface Props {
  date: string;
  suggestion: GpsDaySuggestion | null | undefined;
  onOpenDetail: (date: string) => void;
  onOpenMap?: (date: string) => void;
}

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function SuggestionRow({ date, suggestion, onOpenDetail, onOpenMap }: Props) {
  const dateObj = parseISO(date);
  const { effectiveStaffId } = useMobileAuth();
  const { submitDayReport, isSaving } = useSubmitStaffDayReport();
  const [justApproved, setJustApproved] = useState(false);

  const hasGps = !!suggestion?.hasGps;
  const start = suggestion?.suggestedStartIso ?? null;
  const end = suggestion?.suggestedEndIso ?? null;
  const workMin = suggestion?.suggestedWorkMinutes ?? 0;
  const travelMin = suggestion?.suggestedTravelMinutes ?? 0;
  const totalMin = workMin + travelMin;
  const places = suggestion?.perTarget ?? [];

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effectiveStaffId || !start || !end) return;
    try {
      await submitDayReport({
        staffId: effectiveStaffId,
        date,
        breakMinutes: suggestion?.suggestedBreakMinutes ?? 0,
        requestedStartAt: start,
        requestedEndAt: end,
        comment: 'Godkänd GPS-förslag',
      });
      setJustApproved(true);
      toast({ title: 'Dagen godkänd', description: 'Tidsförslaget skickades in.' });
    } catch (err) {
      toast({
        title: 'Kunde inte godkänna',
        description: err instanceof Error ? err.message : 'Okänt fel',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onOpenDetail(date)}
          className="flex-1 min-w-0 text-left flex items-start gap-2.5 px-3 py-3 active:bg-muted/40 transition-colors"
        >
          <div className="w-10 shrink-0 text-center pt-0.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">
              {format(dateObj, 'EEE', { locale: sv })}
            </p>
            <p className="text-lg font-extrabold tabular-nums text-foreground leading-none mt-1">
              {format(dateObj, 'd')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {format(dateObj, 'MMM', { locale: sv })}
            </p>
          </div>

          <div className="flex-1 min-w-0">
            {!hasGps ? (
              <>
                <p className="text-sm font-extrabold text-foreground">Rapportera tid</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ingen GPS-aktivitet idag. Tryck för att fylla i manuellt.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-extrabold tabular-nums text-foreground">
                    {totalMin > 0 ? formatHoursMinutes(totalMin / 60) : 'GPS-förslag'}
                  </p>
                  {start && end && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {formatStockholmHm(start)}–{formatStockholmHm(end)}
                    </p>
                  )}
                </div>
                <span className="mt-1 inline-block text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                  GPS-FÖRSLAG
                </span>

                {places.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {places.slice(0, 4).map((p) => (
                      <li
                        key={`${p.kind}::${p.id}`}
                        className="flex items-baseline justify-between gap-2 text-[12px] leading-snug"
                      >
                        <span className="flex items-baseline gap-1 min-w-0">
                          <MapPin className="w-2.5 h-2.5 text-primary/60 shrink-0 translate-y-[1px]" />
                          <span className="truncate text-foreground/85">{p.name}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {fmtDur(p.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ingen känd plats matchad — tryck för att granska.
                  </p>
                )}

                <p className="text-[11px] text-foreground/70 mt-1.5 inline-flex items-center gap-0.5">
                  Justera
                  <ChevronRight className="w-3 h-3" />
                </p>
              </>
            )}
          </div>
        </button>

        {hasGps && start && end && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSaving || justApproved}
            aria-label="Godkänn GPS-förslag"
            title="Godkänn GPS-förslag"
            className={cn(
              'shrink-0 w-10 flex items-center justify-center border-l border-border/60 transition-colors',
              justApproved
                ? 'text-emerald-600 bg-emerald-500/10'
                : 'text-primary hover:bg-primary/10 active:bg-primary/20',
              isSaving && 'opacity-50',
            )}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
        )}

        {onOpenMap && hasGps && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMap(date);
            }}
            aria-label="Visa karta"
            title="Visa karta"
            className="shrink-0 w-10 flex items-center justify-center border-l border-border/60 text-muted-foreground hover:text-primary active:bg-muted/40 transition-colors"
          >
            <MapIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
