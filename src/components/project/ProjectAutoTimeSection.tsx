import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, AlertTriangle, Car } from 'lucide-react';
import { useProjectTimeSummary } from '@/hooks/useProjectTimeSummary';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectTarget } from '@/lib/projects/projectTimeModel';

interface Props {
  target: ProjectTarget;
  includeBookingIds?: string[];
}

const fmt = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}min`;
  if (h) return `${h}h`;
  return `${r}min`;
};

/**
 * Visar auto-startad / pågående / föreslagen projekttid (LTE) + auto-switch
 * travel mot projektet — så admin ser det utan att skapa time_report manuellt.
 */
export const ProjectAutoTimeSection = ({ target, includeBookingIds = [] }: Props) => {
  const { data: summary, isLoading } = useProjectTimeSummary({ target, includeBookingIds });

  const { data: staffMap = {} } = useQuery({
    queryKey: ['staff-names-map'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_members').select('id, name');
      const m: Record<string, string> = {};
      (data || []).forEach((s: any) => { m[s.id] = s.name; });
      return m;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading || !summary) {
    return (
      <Card><CardContent className="p-6">
        <div className="h-20 bg-muted/40 animate-pulse rounded-lg" />
      </CardContent></Card>
    );
  }

  const hasAny = summary.activeMinutes + summary.suggestedMinutes
    + summary.travelMinutesApproved + summary.travelMinutesSuggested > 0;

  if (!hasAny) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Auto-registrerad projekttid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Pågående" minutes={summary.activeMinutes} tone="active" />
          <Stat label="Föreslaget (LTE)" minutes={summary.suggestedMinutes} tone="suggested" />
          <Stat label="Restid godkänd" minutes={summary.travelMinutesApproved} tone="travel" />
          <Stat label="Restid föreslagen" minutes={summary.travelMinutesSuggested} tone="suggested" />
        </div>

        {summary.staffBreakdown.length > 0 && (
          <div className="divide-y divide-border/40">
            {summary.staffBreakdown.map(s => (
              <div key={s.staffId} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-medium flex-1 truncate">
                  {staffMap[s.staffId] || s.staffId.slice(0, 8)}
                </span>
                {s.activeMinutes > 0 && (
                  <Badge variant="default" className="gap-1">
                    <Clock className="h-3 w-3" /> {fmt(s.activeMinutes)}
                  </Badge>
                )}
                {s.suggestedMinutes > 0 && (
                  <Badge variant="secondary">{fmt(s.suggestedMinutes)} förslag</Badge>
                )}
                {(s.travelMinutesApproved + s.travelMinutesSuggested) > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Car className="h-3 w-3" /> {fmt(s.travelMinutesApproved + s.travelMinutesSuggested)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {summary.anomalies.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.anomalies.length} avvikelse(r) att granska
            </div>
            <ul className="text-xs text-amber-900/80 dark:text-amber-200/80 space-y-0.5">
              {summary.anomalies.slice(0, 5).map((a, i) => (
                <li key={i}>• {a.message}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, minutes, tone }: { label: string; minutes: number; tone: 'active' | 'suggested' | 'travel' }) => {
  const color =
    tone === 'active' ? 'text-foreground'
    : tone === 'travel' ? 'text-blue-600 dark:text-blue-400'
    : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{minutes > 0 ? fmt(minutes) : '—'}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
};
