/**
 * WorkdayFlagsAdminSection — admin-vy för workday_flags per personal.
 *
 * Visar alla öppna OCH lösta flaggor för vald personal i en månad. Admin kan:
 *   • markera en flagga som löst med resolution_source='admin' + note
 *   • se relaterad rapport/booking/projekt/location
 *   • se vem som löst (staff/admin/auto) tidigare
 *
 * Designprinciper:
 *   • Flaggorna ÄR INTE samma sak som geofence-/presence-anomalierna
 *     (time_report_anomalies). Vi visar därför sektionen separat och kallar
 *     den "Arbetsdagsavvikelser" så ingen blandar ihop koncepten.
 *   • Vi ändrar aldrig rapporterad tid härifrån — flaggorna är observationer.
 *   • Hämtning sker via supabase-klienten direkt (inte mobile-app-api) eftersom
 *     admin redan har JWT med org-RLS-rättigheter.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { toast } from 'sonner';
import type { WorkdayFlagType } from '@/services/mobileApiService';

const FLAG_LABELS: Record<WorkdayFlagType | string, string> = {
  missing_break: 'Saknad rast',
  unclear_day_end: 'Oklart dagsslut',
  presence_without_report: 'Närvaro utan rapport',
  activity_ended_day_continues: 'Aktivitet avslutad — dagen fortsätter',
  geofence_presence_mismatch: 'Närvaro matchar inte rapport',
  team_time_deviation: 'Teamtidavvikelse',
  unreasonable_travel: 'Orimlig restid',
  time_gap: 'Tidslucka',
  missing_report: 'Saknad tidrapport',
  long_day: 'Extremt lång arbetsdag',
  overlapping_times: 'Överlappande tider',
  auto_closed_overnight: 'Arbetsdagen stängdes automatiskt',
  auto_closed_travel: 'Restimer stängdes automatiskt',
  auto_closed_report: 'Tidrapport stängdes automatiskt',
};

interface Props {
  staffId: string;
  monthStart: string; // YYYY-MM-DD
  monthEnd: string; // YYYY-MM-DD
}

export const WorkdayFlagsAdminSection = ({ staffId, monthStart, monthEnd }: Props) => {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [openNote, setOpenNote] = useState<Record<string, string>>({});

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['admin-workday-flags', staffId, monthStart, monthEnd, showResolved],
    queryFn: async () => {
      let q = supabase
        .from('workday_flags')
        .select('*')
        .eq('staff_id', staffId)
        .gte('flag_date', monthStart)
        .lte('flag_date', monthEnd)
        .order('flag_date', { ascending: false });
      if (!showResolved) q = q.eq('resolved', false);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('workday_flags')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolution_source: 'admin',
          resolution_note: note || null,
          resolved_by: auth.user?.id || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Avvikelsen markerad som hanterad');
      qc.invalidateQueries({ queryKey: ['admin-workday-flags', staffId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte spara'),
  });

  const openCount = useMemo(() => flags.filter((f: any) => !f.resolved).length, [flags]);
  const needsInputCount = useMemo(
    () => flags.filter((f: any) => !f.resolved && f.needs_user_input).length,
    [flags],
  );

  return (
    <PremiumCard
      icon={AlertTriangle}
      title="Arbetsdagsavvikelser"
      subtitle={`${openCount} öppna · ${needsInputCount} väntar på personalsvar`}
    >
      <div className="flex justify-end -mt-2 mb-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {expanded ? <>Dölj <ChevronUp className="h-3 w-3" /></> : <>Visa <ChevronDown className="h-3 w-3" /></>}
        </button>
      </div>
      {!expanded ? null : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Workday-flaggor är osäkerheter som assistenten registrerat —
              de ändrar aldrig rapporterad tid automatiskt.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResolved((x) => !x)}
              className="text-xs h-7"
            >
              {showResolved ? 'Dölj hanterade' : 'Visa hanterade'}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laddar avvikelser…
            </div>
          ) : flags.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Inga {showResolved ? '' : 'öppna '}avvikelser i perioden.
            </p>
          ) : (
            <ul className="space-y-2">
              {flags.map((f: any) => {
                const label = FLAG_LABELS[f.flag_type] || f.flag_type;
                const noteValue = openNote[f.id] ?? '';
                return (
                  <li
                    key={f.id}
                    className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              f.severity === 'error'
                                ? 'destructive'
                                : f.severity === 'warning'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className="text-xs"
                          >
                            {label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(f.flag_date), 'EEE d MMM', { locale: sv })}
                          </span>
                          {f.needs_user_input && !f.resolved && (
                            <Badge variant="outline" className="text-xs">
                              Väntar svar
                            </Badge>
                          )}
                          {f.resolved && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Check className="h-3 w-3" />
                              {f.resolution_source === 'staff'
                                ? 'Löst av personal'
                                : f.resolution_source === 'admin'
                                  ? 'Löst av admin'
                                  : 'Auto-löst'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{f.title}</p>
                        {f.description && (
                          <p className="text-xs text-muted-foreground">{f.description}</p>
                        )}
                        {f.resolution_note && (
                          <p className="text-xs italic text-muted-foreground">
                            Svar: "{f.resolution_note}"
                          </p>
                        )}
                      </div>
                    </div>

                    {!f.resolved && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Textarea
                          value={noteValue}
                          onChange={(e) =>
                            setOpenNote((p) => ({ ...p, [f.id]: e.target.value }))
                          }
                          placeholder="Admin-anteckning (valfritt)"
                          className="text-xs min-h-[36px] flex-1"
                          rows={1}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolveMutation.isPending}
                          onClick={() =>
                            resolveMutation.mutate({ id: f.id, note: noteValue })
                          }
                          className="text-xs"
                        >
                          {resolveMutation.isPending && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          Markera som hanterad
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </PremiumCard>
  );
};

export default WorkdayFlagsAdminSection;
