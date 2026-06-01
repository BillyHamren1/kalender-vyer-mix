/**
 * BookingTodosChecklist
 * --------------------------------------------------------------------------
 * Full översikt över bokningens to-dos på bokningssidan.
 *
 * Regler (per användarens spec):
 *  - Fas-rader (Rigg/Event/Nedrivning) ÄR INTE to-dos. De är dagrubriker.
 *  - Bokningens dagar (rigDates + eventDates + rigDownDates) bildar grupp-
 *    rubriker — alla visas alltid, även om de saknar to-dos.
 *  - En to-do med specifikt `plan_date` visas under den dagens grupp.
 *  - En to-do UTAN `plan_date` (null) gäller hela bokningen och visas under
 *    SAMTLIGA bokningsdagar (med samma id — checkbox-status delas).
 *  - Nyskapade to-dos från "Orderrader utan to-do" får `plan_date = null`
 *    så de gäller alla dagar tills man väljer ett specifikt datum.
 *
 * Skriver ENBART till large_project_booking_plan_items via service.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  CalendarClock,
  ClipboardList,
  Layers,
  Loader2,
  Package,
  Plus,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProjectTeam } from '@/hooks/useProjectTeam';
import { useBookingProductsForPlanner } from '@/hooks/useBookingProductsForPlanner';
import {
  createLargeProjectPlannerItem,
  deleteLargeProjectPlannerItem,
  updateLargeProjectPlannerItem,
} from '@/components/project/large-planner/largeProjectPlannerService';
import BookingTodoDateChip, { DateQuickPick } from './BookingTodoDateChip';
import BookingTodoTimeChip from './BookingTodoTimeChip';

interface PlanRow {
  id: string;
  title: string;
  status: string;
  plan_date: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_staff_id: string | null;
  booking_product_id: string | null;
  notes: string | null;
  large_project_id: string;
  source_booking_phase: string | null;
  item_type: string;
  source: string;
  large_projects?: { name: string | null; project_number: string | null } | null;
  booking_products?: {
    name: string | null;
    sku: string | null;
    is_package_component: boolean | null;
    parent_product_id: string | null;
  } | null;
}

async function fetchRows(bookingId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase
    .from('large_project_booking_plan_items')
    .select(
      `id,title,status,plan_date,start_time,end_time,assigned_staff_id,booking_product_id,notes,large_project_id,source_booking_phase,item_type,source,
       large_projects:large_project_id(name,project_number),
       booking_products:booking_product_id(name,sku,is_package_component,parent_product_id)`,
    )
    .eq('booking_id', bookingId)
    .order('plan_date', { ascending: true, nullsFirst: true })
    .order('start_time', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as unknown as PlanRow[];
}

/** Paketmedlemmar (komponenter under ett paket) ska aldrig vara egna to-dos. */
const isPackageMember = (
  p: { is_package_component?: boolean | null; parent_product_id?: string | null } | null | undefined,
): boolean => !!p && (!!p.is_package_component || !!p.parent_product_id);

/** Fas-rader från bokningsspegeln är dagrubriker, inte to-dos. */
const isPhaseRow = (r: PlanRow): boolean =>
  r.item_type === 'booking' || (r.source === 'booking' && !r.booking_product_id);

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planerad',
  unplanned: 'Ej planerad',
  in_progress: 'Pågående',
  done: 'Klar',
  blocked: 'Blockerad',
};

const PHASE_LABEL: Record<string, string> = {
  rig: 'Rigg',
  event: 'Event',
  rigDown: 'Nedrivning',
};

interface Props {
  bookingId: string;
  largeProjectId?: string | null;
  /** Alla bokningsdagar — bildar grupp-rubriker. */
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
}

const UNASSIGNED = '__unassigned__';

interface DayHeader {
  date: string;
  phase: 'rig' | 'event' | 'rigDown';
}

const BookingTodosChecklist = ({
  bookingId,
  largeProjectId,
  rigDates,
  eventDates,
  rigDownDates,
}: Props) => {
  const qc = useQueryClient();
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['booking-todos-checklist', bookingId],
    queryFn: () => fetchRows(bookingId),
    enabled: !!bookingId,
    staleTime: 30_000,
  });
  const { teamMembers: team } = useProjectTeam(bookingId);
  const { data: products } = useBookingProductsForPlanner(bookingId);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const lpId = largeProjectId ?? rows?.[0]?.large_project_id ?? null;

  /** Bygg unika dagrubriker från bokningens datum. */
  const dayHeaders = useMemo<DayHeader[]>(() => {
    const map = new Map<string, DayHeader>();
    rigDates.forEach((d) => map.set(d, { date: d, phase: 'rig' }));
    eventDates.forEach((d) => {
      if (!map.has(d)) map.set(d, { date: d, phase: 'event' });
    });
    rigDownDates.forEach((d) => {
      if (!map.has(d)) map.set(d, { date: d, phase: 'rigDown' });
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rigDates, eventDates, rigDownDates]);

  const quickPicks = useMemo<DateQuickPick[]>(() => {
    return dayHeaders.map((h) => ({
      label: PHASE_LABEL[h.phase] ?? h.phase,
      date: h.date,
    }));
  }, [dayHeaders]);

  /** Riktiga to-dos = inga paketmedlemmar, inga fas-rader. */
  const todoRows = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !isPhaseRow(r))
        .filter((r) => !isPackageMember(r.booking_products ?? null)),
    [rows],
  );

  /** To-dos utan datum gäller hela bokningen. */
  const todosForAllDays = useMemo(
    () => todoRows.filter((r) => !r.plan_date),
    [todoRows],
  );

  /** To-dos med specifikt datum, grupperade per dag. */
  const todosByDate = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    todoRows.forEach((r) => {
      if (!r.plan_date) return;
      const list = map.get(r.plan_date) ?? [];
      list.push(r);
      map.set(r.plan_date, list);
    });
    return map;
  }, [todoRows]);

  /** Städa upp ev. paketmedlems-rader (en gång). */
  useEffect(() => {
    const stale = (rows ?? []).filter((r) =>
      isPackageMember(r.booking_products ?? null),
    );
    if (stale.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const r of stale) {
        try {
          await deleteLargeProjectPlannerItem(r.id);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) invalidate();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const stats = useMemo(() => {
    const total = todoRows.length;
    const done = todoRows.filter((r) => r.status === 'done').length;
    return { total, done };
  }, [todoRows]);

  const productsWithoutTodo = useMemo(() => {
    if (!products) return [];
    const linked = new Set(
      todoRows.map((r) => r.booking_product_id).filter((id): id is string => !!id),
    );
    return products
      .filter((p) => !isPackageMember(p))
      .filter((p) => !linked.has(p.id));
  }, [products, todoRows]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['booking-todos-checklist', bookingId] });
    qc.invalidateQueries({ queryKey: ['lp-plan-mirror-for-booking', bookingId] });
    qc.invalidateQueries({ queryKey: ['large-project-planner'] });
  };

  const patchLocal = (id: string, patch: Partial<PlanRow>) => {
    qc.setQueryData<PlanRow[]>(['booking-todos-checklist', bookingId], (prev) =>
      (prev ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const toggleDone = async (row: PlanRow, checked: boolean) => {
    patchLocal(row.id, { status: checked ? 'done' : 'planned' });
    try {
      await updateLargeProjectPlannerItem(row.id, {
        status: checked ? 'done' : 'planned',
      } as never);
      invalidate();
    } catch (e) {
      toast.error('Kunde inte uppdatera status', { description: (e as Error).message });
      invalidate();
    }
  };

  const setAssignee = async (row: PlanRow, staffId: string) => {
    const value = staffId === UNASSIGNED ? null : staffId;
    patchLocal(row.id, { assigned_staff_id: value });
    try {
      await updateLargeProjectPlannerItem(row.id, { assigned_staff_id: value } as never);
      invalidate();
    } catch (e) {
      toast.error('Kunde inte tilldela personal', { description: (e as Error).message });
      invalidate();
    }
  };

  const setDate = async (row: PlanRow, planDate: string | null) => {
    patchLocal(row.id, { plan_date: planDate });
    try {
      await updateLargeProjectPlannerItem(row.id, { plan_date: planDate } as never);
      invalidate();
    } catch (e) {
      toast.error('Kunde inte uppdatera datum', { description: (e as Error).message });
      invalidate();
    }
  };

  const setTime = async (
    row: PlanRow,
    startTime: string | null,
    endTime: string | null,
  ) => {
    patchLocal(row.id, { start_time: startTime, end_time: endTime });
    try {
      await updateLargeProjectPlannerItem(row.id, {
        start_time: startTime,
        end_time: endTime,
      } as never);
      invalidate();
    } catch (e) {
      toast.error('Kunde inte uppdatera tid', { description: (e as Error).message });
      invalidate();
    }
  };

  const createTodoForProduct = async (product: { id: string; name: string }) => {
    if (!lpId) {
      toast.error('Saknar koppling till stort projekt.');
      return;
    }
    setCreatingFor(product.id);
    try {
      await createLargeProjectPlannerItem({
        large_project_id: lpId,
        booking_id: bookingId,
        booking_product_id: product.id,
        title: product.name,
        // null = gäller alla bokningsdagar tills man väljer ett specifikt datum
        plan_date: null,
        item_type: 'task',
        source: 'manual',
        status: 'planned',
      } as never);
      invalidate();
    } catch (e) {
      toast.error('Kunde inte skapa to-do', { description: (e as Error).message });
    } finally {
      setCreatingFor(null);
    }
  };

  const renderTodoRow = (r: PlanRow, opts?: { mirrored?: boolean }) => (
    <li
      key={`${r.id}-${opts?.mirrored ? 'm' : 'p'}`}
      className="flex flex-wrap items-center gap-2 px-2 py-2"
    >
      <Checkbox
        checked={r.status === 'done'}
        onCheckedChange={(c) => void toggleDone(r, !!c)}
        aria-label={`Markera ${r.title} som klar`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`text-xs font-medium ${
            r.status === 'done' ? 'line-through text-muted-foreground' : ''
          }`}
        >
          {r.title}
        </div>
        {r.booking_products?.name && (
          <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Package className="h-2.5 w-2.5" />
            {r.booking_products.name}
          </div>
        )}
      </div>
      {opts?.mirrored ? (
        <Badge
          variant="secondary"
          className="h-7 gap-1 px-2 text-[10px] font-normal"
          title="Den här to-don saknar specifikt datum och visas på samtliga bokningsdagar"
        >
          <Layers className="h-3 w-3" /> Alla dagar
        </Badge>
      ) : (
        <BookingTodoDateChip
          value={r.plan_date}
          quickPicks={quickPicks}
          allowClear
          emptyLabel="Alla dagar"
          clearLabel="Gäller alla dagar"
          onChange={(d) => void setDate(r, d)}
        />
      )}
      <BookingTodoTimeChip
        start={r.start_time}
        end={r.end_time}
        onChange={(s, e) => void setTime(r, s, e)}
      />
      <Select
        value={r.assigned_staff_id ?? UNASSIGNED}
        onValueChange={(v) => void setAssignee(r, v)}
      >
        <SelectTrigger className="h-7 w-[140px] text-[11px]">
          <SelectValue placeholder="Tilldela…">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {team?.find((t) => t.staff_id === r.assigned_staff_id)?.staff_name ??
                'Ingen'}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Ingen</SelectItem>
          {(team ?? []).map((t) => (
            <SelectItem key={t.staff_id} value={t.staff_id}>
              {t.staff_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="outline" className="shrink-0 text-[9px]">
        {STATUS_LABEL[r.status] ?? r.status}
      </Badge>
    </li>
  );

  const hasAnyTodos = todoRows.length > 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-primary" />
            To-do & checklista
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {stats.done} av {stats.total} klara
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1 space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Laddar…
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive">
            {(error as Error).message || 'Kunde inte ladda to-dos.'}
          </div>
        )}

        {!isLoading && !hasAnyTodos && dayHeaders.length === 0 && (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
            Inga bokningsdagar eller to-dos ännu.
          </div>
        )}

        {/* Sektion: to-dos utan specifikt datum (gäller alla dagar) */}
        {todosForAllDays.length > 0 && (
          <div className="rounded border border-border/40">
            <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/40 px-2 py-1 text-xs font-medium">
              <Layers className="h-3 w-3 text-muted-foreground" />
              Gäller alla bokningsdagar
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({todosForAllDays.length})
              </span>
            </div>
            <ul className="divide-y divide-border/30">
              {todosForAllDays.map((r) => renderTodoRow(r))}
            </ul>
          </div>
        )}

        {/* Sektion per bokningsdag */}
        {dayHeaders.map((h) => {
          const specific = todosByDate.get(h.date) ?? [];
          return (
            <div key={h.date} className="rounded border border-border/40">
              <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/40 px-2 py-1 text-xs font-medium">
                <CalendarClock className="h-3 w-3 text-muted-foreground" />
                <span>{format(parseISO(h.date), 'EEE d MMM yyyy', { locale: sv })}</span>
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  {PHASE_LABEL[h.phase] ?? h.phase}
                </Badge>
              </div>
              <ul className="divide-y divide-border/30">
                {specific.map((r) => renderTodoRow(r))}
                {todosForAllDays.map((r) => renderTodoRow(r, { mirrored: true }))}
                {specific.length === 0 && todosForAllDays.length === 0 && (
                  <li className="px-2 py-2 text-[11px] italic text-muted-foreground">
                    Inga to-dos för dagen.
                  </li>
                )}
              </ul>
            </div>
          );
        })}

        {lpId && productsWithoutTodo.length > 0 && (
          <div className="rounded border border-dashed border-border/50">
            <div className="border-b border-border/40 bg-muted/30 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Orderrader utan to-do ({productsWithoutTodo.length})
            </div>
            <ul className="divide-y divide-border/30">
              {productsWithoutTodo.slice(0, 20).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5"
                >
                  <div className="min-w-0 text-xs">
                    <span className="font-medium">{p.name}</span>
                    {p.quantity != null && (
                      <span className="ml-1 text-muted-foreground">×{p.quantity}</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    disabled={creatingFor === p.id}
                    onClick={() => void createTodoForProduct(p)}
                  >
                    {creatingFor === p.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Skapa to-do
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!lpId && (
          <p className="text-[11px] italic text-muted-foreground">
            Bokningen är inte kopplad till ett stort projekt — to-dos kan inte skapas
            här ännu.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingTodosChecklist;
