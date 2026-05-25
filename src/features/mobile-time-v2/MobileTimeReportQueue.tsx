/**
 * MobileTimeReportQueue — startsidan för /m/report.
 *
 * Visar en kompakt rapportkö över de senaste 14 dagarna grupperad i
 * "Att göra" och "Skickade / klara". Klick på en dag öppnar dagvyn.
 */
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ClipboardList, CheckCircle2 } from 'lucide-react';
import { getMobileTimeReportQueue } from './mobileTimeV2Api';
import type { TimeReportQueue, TimeReportQueueDay } from './types';
import MobileTimeReportDayCard from './MobileTimeReportDayCard';

interface Props {
  staffId: string;
  onOpenDay: (date: string) => void;
}

const DONE_STATUSES = new Set(['submitted', 'edited', 'needs_control', 'ai_flagged', 'approved', 'payroll_approved']);

const MobileTimeReportQueue: React.FC<Props> = ({ staffId, onOpenDay }) => {
  const [data, setData] = useState<TimeReportQueue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const queue = await getMobileTimeReportQueue({ staffId });
      setData(queue);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda rapportkön');
    } finally {
      setIsLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void load(); }, [load]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todoDays: TimeReportQueueDay[] = [];
  const doneDays: TimeReportQueueDay[] = [];
  for (const d of data?.days ?? []) {
    if (DONE_STATUSES.has(d.status)) doneDays.push(d);
    else todoDays.push(d);
  }
  // todoDays redan sorterat på priority asc, datum desc (server)
  // Lyft idag först om den finns i todo
  todoDays.sort((a, b) => {
    if (a.date === today && b.date !== today) return -1;
    if (b.date === today && a.date !== today) return 1;
    return 0;
  });

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-card border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
              <ClipboardList className="h-3 w-3" />
              Tidrapport
            </div>
            <h1 className="text-2xl font-semibold mt-0.5">Dagar att skicka in</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Uppdatera"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-5 w-full">
        {isLoading && !data && (
          <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar dagar…
          </Card>
        )}

        {error && !isLoading && (
          <Card className="p-4 border-destructive/40 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Försök igen
            </Button>
          </Card>
        )}

        {data && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Att göra
                </h2>
                <span className="text-[11px] text-muted-foreground">{todoDays.length}</span>
              </div>
              {todoDays.length === 0 ? (
                <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground bg-emerald-50/40 border-emerald-200/60">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Inga dagar väntar på dig just nu.
                </Card>
              ) : (
                <div className="space-y-2">
                  {todoDays.map((d) => (
                    <MobileTimeReportDayCard
                      key={d.date}
                      day={d}
                      highlight={d.date === today}
                      onOpen={() => onOpenDay(d.date)}
                    />
                  ))}
                </div>
              )}
            </section>

            {doneDays.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Skickade & klara
                  </h2>
                  <span className="text-[11px] text-muted-foreground">{doneDays.length}</span>
                </div>
                <div className="space-y-2">
                  {doneDays.map((d) => (
                    <MobileTimeReportDayCard
                      key={d.date}
                      day={d}
                      onOpen={() => onOpenDay(d.date)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MobileTimeReportQueue;
