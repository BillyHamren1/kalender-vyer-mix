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
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
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

  const todoCount = todoDays.length;
  const subtitle = todoCount === 0
    ? 'Inga dagar väntar på dig'
    : `${todoCount} ${todoCount === 1 ? 'dag väntar' : 'dagar väntar'} på dig`;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <MobileHeroHeader
        eyebrow="Tidrapport"
        title="Dagar att skicka in"
        subtitle={subtitle}
        rightAction={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Uppdatera"
            className="h-9 w-9 rounded-xl text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />


      <div className="flex-1 px-4 pt-5 space-y-6 w-full">
        {isLoading && !data && (
          <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground rounded-2xl border-border/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar dagar…
          </Card>
        )}

        {error && !isLoading && (
          <Card className="p-4 border-destructive/40 bg-destructive/5 rounded-2xl">
            <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Försök igen
            </Button>
          </Card>
        )}

        {data && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                  Att göra
                </h2>
                {todoDays.length > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                    {todoDays.length}
                  </span>
                )}
              </div>
              {todoDays.length === 0 ? (
                <Card className="p-4 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50/60 border-emerald-200/70 rounded-2xl">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
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
              <section className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    Skickade & klara
                  </h2>
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center">
                    {doneDays.length}
                  </span>
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
