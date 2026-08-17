import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPinOff,
  PackageOpen,
  Truck,
  UsersRound,
} from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TransportAssignment } from '@/hooks/useTransportAssignments';
import { BookingForTransport } from '@/hooks/useBookingsForTransport';
import { Vehicle } from '@/hooks/useVehicles';

export type LogisticsActionKind = 'unplanned' | 'missing-time' | 'partner-pending' | 'address' | 'partner-declined';

export interface LogisticsAction {
  id: string;
  kind: LogisticsActionKind;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  bookingId?: string;
  assignmentId?: string;
}

interface LogisticsOperationsOverviewProps {
  currentDate: Date;
  assignments: TransportAssignment[];
  bookingsWithoutTransport: BookingForTransport[];
  vehicles: Vehicle[];
  isLoading: boolean;
  onOpenTransport: () => void;
}

const isBookingInWeek = (booking: BookingForTransport, weekStart: Date, weekEnd: Date) => {
  return [booking.rigdaydate, booking.eventdate, booking.rigdowndate]
    .filter(Boolean)
    .some((value) => {
      try {
        return isWithinInterval(parseISO(value as string), { start: weekStart, end: weekEnd });
      } catch {
        return false;
      }
    });
};

const getBookingDateLabel = (booking: BookingForTransport) => {
  const candidate = booking.rigdaydate || booking.eventdate || booking.rigdowndate;
  if (!candidate) return 'Datum saknas';
  try {
    return format(parseISO(candidate), 'EEE d MMM', { locale: sv });
  } catch {
    return candidate;
  }
};

const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ElementType;
  tone?: 'default' | 'warning' | 'success';
}) => (
  <div
    className={cn(
      'rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/[0.035]',
      tone === 'success' && 'border-emerald-500/25 bg-emerald-500/[0.025]'
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      </div>
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground',
          tone === 'warning' && 'border-amber-500/25 bg-amber-500/10 text-amber-600',
          tone === 'success' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>
  </div>
);

const LogisticsOperationsOverview: React.FC<LogisticsOperationsOverviewProps> = ({
  currentDate,
  assignments,
  bookingsWithoutTransport,
  vehicles,
  isLoading,
  onOpenTransport,
}) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const weekUnplanned = useMemo(
    () => bookingsWithoutTransport.filter((booking) => isBookingInWeek(booking, weekStart, weekEnd)),
    [bookingsWithoutTransport, weekStart.getTime(), weekEnd.getTime()]
  );

  const metrics = useMemo(() => {
    const delivered = assignments.filter((a) => a.status === 'delivered').length;
    const missingTime = assignments.filter((a) => !a.transport_time && a.status !== 'delivered' && a.status !== 'skipped').length;
    const pendingPartner = assignments.filter(
      (a) => a.vehicle?.is_external && (!a.partner_response || a.partner_response === 'pending') && a.status !== 'delivered'
    ).length;
    const declinedPartner = assignments.filter((a) => a.vehicle?.is_external && a.partner_response === 'declined').length;
    const addressIssues = assignments.filter(
      (a) => !a.booking?.deliveryaddress || a.booking.delivery_latitude == null || a.booking.delivery_longitude == null
    ).length;

    const activeInternal = vehicles.filter((v) => v.is_active && !v.is_external);
    const usedInternalIds = new Set(
      assignments.filter((a) => a.vehicle && !a.vehicle.is_external).map((a) => a.vehicle_id)
    );

    return {
      delivered,
      missingTime,
      pendingPartner,
      declinedPartner,
      addressIssues,
      activeInternal: activeInternal.length,
      usedInternal: activeInternal.filter((v) => usedInternalIds.has(v.id)).length,
    };
  }, [assignments, vehicles]);

  const actions = useMemo<LogisticsAction[]>(() => {
    const result: LogisticsAction[] = [];

    weekUnplanned.forEach((booking) => {
      result.push({
        id: `unplanned-${booking.id}`,
        kind: 'unplanned',
        severity: 'critical',
        title: `${booking.client || 'Bokning'} saknar transportplanering`,
        description: `${getBookingDateLabel(booking)}${booking.delivery_city ? ` · ${booking.delivery_city}` : ''}`,
        bookingId: booking.id,
      });
    });

    assignments.forEach((assignment) => {
      const client = assignment.booking?.client || 'Transport';
      const dateLabel = (() => {
        try {
          return format(parseISO(assignment.transport_date), 'EEE d MMM', { locale: sv });
        } catch {
          return assignment.transport_date;
        }
      })();

      if (assignment.vehicle?.is_external && assignment.partner_response === 'declined') {
        result.push({
          id: `declined-${assignment.id}`,
          kind: 'partner-declined',
          severity: 'critical',
          title: `Partner har nekat ${client}`,
          description: `${dateLabel} · ${assignment.vehicle?.name || 'Extern partner'}`,
          assignmentId: assignment.id,
          bookingId: assignment.booking_id,
        });
      } else if (
        assignment.vehicle?.is_external &&
        (!assignment.partner_response || assignment.partner_response === 'pending') &&
        assignment.status !== 'delivered'
      ) {
        result.push({
          id: `partner-${assignment.id}`,
          kind: 'partner-pending',
          severity: 'warning',
          title: `Väntar på partnersvar för ${client}`,
          description: `${dateLabel} · ${assignment.vehicle?.name || 'Extern partner'}`,
          assignmentId: assignment.id,
          bookingId: assignment.booking_id,
        });
      }

      if (!assignment.transport_time && assignment.status !== 'delivered' && assignment.status !== 'skipped') {
        result.push({
          id: `time-${assignment.id}`,
          kind: 'missing-time',
          severity: 'warning',
          title: `${client} saknar transporttid`,
          description: `${dateLabel} · ${assignment.vehicle?.name || 'Fordon ej tilldelat'}`,
          assignmentId: assignment.id,
          bookingId: assignment.booking_id,
        });
      }

      if (!assignment.booking?.deliveryaddress || assignment.booking.delivery_latitude == null || assignment.booking.delivery_longitude == null) {
        result.push({
          id: `address-${assignment.id}`,
          kind: 'address',
          severity: 'info',
          title: `${client} behöver adresskontroll`,
          description: `${dateLabel} · Leveransadress eller kartposition är ofullständig`,
          assignmentId: assignment.id,
          bookingId: assignment.booking_id,
        });
      }
    });

    const priority = { critical: 0, warning: 1, info: 2 } as const;
    return result.sort((a, b) => priority[a.severity] - priority[b.severity]);
  }, [assignments, weekUnplanned]);

  const openActions = actions.length;
  const totalOperational = assignments.length + weekUnplanned.length;
  const completionPercent = assignments.length > 0 ? Math.round((metrics.delivered / assignments.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Veckans flöde"
          value={totalOperational}
          hint={`${assignments.length} planerade · ${weekUnplanned.length} ej planerade`}
          icon={Truck}
        />
        <StatCard
          label="Kräver åtgärd"
          value={openActions}
          hint={openActions === 0 ? 'Inga kända avvikelser i veckans planering' : 'Prioriterade avvikelser att hantera'}
          icon={AlertTriangle}
          tone={openActions > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Egna fordon"
          value={`${metrics.usedInternal}/${metrics.activeInternal}`}
          hint="Aktiva fordon använda i vald vecka"
          icon={Truck}
        />
        <StatCard
          label="Partnerstatus"
          value={metrics.pendingPartner + metrics.declinedPartner}
          hint={`${metrics.pendingPartner} väntar svar · ${metrics.declinedPartner} nekade`}
          icon={UsersRound}
          tone={metrics.declinedPartner > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Genomfört"
          value={`${completionPercent}%`}
          hint={`${metrics.delivered} av ${assignments.length} transporter levererade`}
          icon={CheckCircle2}
          tone={completionPercent === 100 && assignments.length > 0 ? 'success' : 'default'}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background">
                <CalendarClock className="h-4 w-4 text-foreground" />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Åtgärder nu</h2>
              {openActions > 0 && <Badge variant="secondary" className="rounded-full">{openActions}</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Endast sådant som behöver ett aktivt beslut eller komplettering.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onOpenTransport} className="shrink-0">
            Öppna transportplanering
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {actions.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Planeringen ser komplett ut</p>
              <p className="text-xs text-muted-foreground">Inga identifierade transportavvikelser för vald vecka.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {actions.slice(0, 6).map((action) => {
              const Icon = action.kind === 'unplanned'
                ? PackageOpen
                : action.kind === 'missing-time'
                  ? Clock3
                  : action.kind === 'address'
                    ? MapPinOff
                    : UsersRound;

              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={onOpenTransport}
                  className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                      action.severity === 'critical' && 'border-destructive/20 bg-destructive/10 text-destructive',
                      action.severity === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-600',
                      action.severity === 'info' && 'border-sky-500/20 bg-sky-500/10 text-sky-600'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              );
            })}
            {actions.length > 6 && (
              <button
                type="button"
                onClick={onOpenTransport}
                className="w-full px-5 py-3 text-center text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                Visa ytterligare {actions.length - 6} åtgärder
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default LogisticsOperationsOverview;
