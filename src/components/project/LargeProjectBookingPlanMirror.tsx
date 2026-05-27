/**
 * LargeProjectBookingPlanMirror
 * --------------------------------------------------------------------------
 * Visar i en bokningsvy de planeringsuppgifter som skapats INUTI det
 * stora projektet och som är kopplade till just denna bokning.
 *
 * Personalkalendern fortsätter använda det stora projektets tider — denna
 * komponent är endast en SPEGEL av large_project_booking_plan_items, så
 * admin ser samma planeringsuppgifter på bokningens egen sida.
 *
 * Read-only. Inga skrivningar.
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarClock, ClipboardList, Loader2, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

interface MirrorRow {
  id: string;
  title: string;
  status: string;
  plan_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_staff_id: string | null;
  booking_product_id: string | null;
  notes: string | null;
  large_project_id: string;
  large_projects?: { name: string | null; project_number: string | null } | null;
  booking_products?: { name: string | null; sku: string | null } | null;
}

async function fetchMirror(bookingId: string): Promise<MirrorRow[]> {
  const { data, error } = await supabase
    .from('large_project_booking_plan_items')
    .select(
      `id,title,status,plan_date,start_time,end_time,assigned_staff_id,booking_product_id,notes,large_project_id,
       large_projects:large_project_id(name,project_number),
       booking_products:booking_product_id(name,sku)`,
    )
    .eq('booking_id', bookingId)
    .order('plan_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as unknown as MirrorRow[];
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planerad',
  unplanned: 'Ej planerad',
  in_progress: 'Pågående',
  done: 'Klar',
  blocked: 'Blockerad',
};

const formatTimeRange = (s: string | null, e: string | null): string => {
  if (!s && !e) return '';
  const trim = (t: string | null) => (t ? t.slice(0, 5) : '');
  if (s && e) return `${trim(s)}–${trim(e)}`;
  return trim(s) || trim(e);
};

interface Props {
  bookingId: string;
}

const LargeProjectBookingPlanMirror = ({ bookingId }: Props) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['lp-plan-mirror-for-booking', bookingId],
    queryFn: () => fetchMirror(bookingId),
    enabled: !!bookingId,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const byDate = new Map<string, MirrorRow[]>();
    (data ?? []).forEach((r) => {
      const list = byDate.get(r.plan_date) ?? [];
      list.push(r);
      byDate.set(r.plan_date, list);
    });
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const toggleDone = async (row: MirrorRow, checked: boolean) => {
    const { error } = await supabase
      .from('large_project_booking_plan_items')
      .update({ status: checked ? 'done' : 'planned' })
      .eq('id', row.id);
    if (error) throw error;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lp-plan-mirror-for-booking', bookingId] }),
      queryClient.invalidateQueries({ queryKey: ['large-project-planner'] }),
    ]);
  };

  if (!isLoading && !error && (!data || data.length === 0)) {
    return null; // Visa ingenting om bokningen inte är planerad inuti ett stort projekt
  }

  const projectMeta = data?.[0]?.large_projects ?? null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <ClipboardList className="h-4 w-4 text-primary" />
          <span>Planering inuti stora projektet</span>
          {projectMeta?.name && (
            <span className="text-xs font-normal text-muted-foreground">
              · {projectMeta.name}
              {projectMeta.project_number ? ` (#${projectMeta.project_number})` : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Laddar planering…
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive">
            {(error as Error).message || 'Kunde inte ladda planering.'}
          </div>
        )}
        {!isLoading && !error && grouped.length > 0 && (
          <div className="space-y-3">
            {grouped.map(([date, rows]) => (
              <div key={date} className="rounded border border-border/40">
                <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/40 px-2 py-1 text-xs font-medium">
                  <CalendarClock className="h-3 w-3 text-muted-foreground" />
                  {format(parseISO(date), 'EEE d MMM yyyy', { locale: sv })}
                </div>
                <ul className="divide-y divide-border/30">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 px-2 py-1.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <Checkbox
                          checked={r.status === 'done'}
                          onCheckedChange={(checked) => void toggleDone(r, !!checked)}
                          aria-label={`Markera ${r.title} som klar`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground">{r.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          {formatTimeRange(r.start_time, r.end_time) && (
                            <span>{formatTimeRange(r.start_time, r.end_time)}</span>
                          )}
                          {r.booking_products?.name && (
                            <span className="inline-flex items-center gap-0.5">
                              <Package className="h-2.5 w-2.5" />
                              {r.booking_products.name}
                            </span>
                          )}
                          {r.notes && <span className="italic">"{r.notes.slice(0, 60)}"</span>}
                        </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[9px]">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LargeProjectBookingPlanMirror;
