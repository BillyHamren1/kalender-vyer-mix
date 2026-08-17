import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, Maximize2, Plus, Truck } from 'lucide-react';
import { addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { useBookingsForTransport } from '@/hooks/useBookingsForTransport';
import { useVehicles } from '@/hooks/useVehicles';
import LogisticsTransportWidget from '@/components/logistics/widgets/LogisticsTransportWidget';
import LogisticsMapWidget from '@/components/logistics/widgets/LogisticsMapWidget';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';
import LogisticsOperationsOverview from '@/components/logistics/LogisticsOperationsOverview';
import LogisticsUnplannedQueue from '@/components/logistics/LogisticsUnplannedQueue';
import QuickTransportDialog from '@/components/logistics/QuickTransportDialog';

type ExpandedWidget = 'transport' | 'map' | null;

const LogisticsPlanning: React.FC = () => {
  const [expanded, setExpanded] = useState<ExpandedWidget>(null);
  const [widgetDateMode, setWidgetDateMode] = useState<'week' | 'month' | 'custom'>('week');
  const [widgetWeekOffset, setWidgetWeekOffset] = useState(0);
  const [widgetMonthOffset, setWidgetMonthOffset] = useState(0);
  const [widgetCustomRange, setWidgetCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [weekViewDate, setWeekViewDate] = useState(new Date());
  const [quickTransportOpen, setQuickTransportOpen] = useState(false);
  const [quickEditAssignment, setQuickEditAssignment] = useState<import('@/hooks/useTransportAssignments').TransportAssignment | null>(null);
  const [quickBookingId, setQuickBookingId] = useState<string | null>(null);

  const combinedRange = useMemo(() => {
    const now = new Date();
    const wvStart = startOfWeek(weekViewDate, { weekStartsOn: 1 });
    const wvEnd = endOfWeek(weekViewDate, { weekStartsOn: 1 });

    let wtStart: Date;
    let wtEnd: Date;
    if (widgetDateMode === 'week') {
      const base = widgetWeekOffset === 0
        ? now
        : widgetWeekOffset > 0
          ? addWeeks(now, widgetWeekOffset)
          : subWeeks(now, Math.abs(widgetWeekOffset));
      wtStart = startOfWeek(base, { weekStartsOn: 1 });
      wtEnd = endOfWeek(base, { weekStartsOn: 1 });
    } else if (widgetDateMode === 'month') {
      const base = widgetMonthOffset === 0
        ? now
        : widgetMonthOffset > 0
          ? addMonths(now, widgetMonthOffset)
          : subMonths(now, Math.abs(widgetMonthOffset));
      wtStart = startOfMonth(base);
      wtEnd = endOfMonth(base);
    } else if (widgetCustomRange) {
      wtStart = widgetCustomRange.from;
      wtEnd = widgetCustomRange.to;
    } else {
      wtStart = startOfWeek(now, { weekStartsOn: 1 });
      wtEnd = endOfWeek(now, { weekStartsOn: 1 });
    }

    return {
      start: wvStart < wtStart ? wvStart : wtStart,
      end: wvEnd > wtEnd ? wvEnd : wtEnd,
      widgetStart: wtStart,
      widgetEnd: wtEnd,
      weekStart: wvStart,
      weekEnd: wvEnd,
    };
  }, [weekViewDate, widgetDateMode, widgetWeekOffset, widgetMonthOffset, widgetCustomRange]);

  const { assignments, isLoading } = useTransportAssignments(combinedRange.start, combinedRange.end);
  const { bookings, withoutTransport, isLoading: bookingsLoading, refetch: refetchBookings } = useBookingsForTransport();
  const { vehicles, activeVehicles, isLoading: vehiclesLoading } = useVehicles();

  const weekAssignments = useMemo(
    () => assignments.filter((assignment) => {
      const value = new Date(`${assignment.transport_date}T00:00:00`);
      return value >= combinedRange.weekStart && value <= combinedRange.weekEnd;
    }),
    [assignments, combinedRange.weekStart, combinedRange.weekEnd]
  );

  const weekLabel = `${format(combinedRange.weekStart, 'd MMM', { locale: sv })} – ${format(combinedRange.weekEnd, 'd MMM yyyy', { locale: sv })}`;

  return (
    <div className="space-y-5 pb-8">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]">
                Control tower
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">{weekLabel}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Logistikplanering</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Samlad operativ överblick över transporter, fordonskapacitet, partnerstatus och bokningar som behöver planeras.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setQuickEditAssignment(null); setQuickBookingId(null); setQuickTransportOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Registrera transport
            </Button>
            <Button variant="outline" onClick={() => setExpanded('map')}>
              <Map className="mr-2 h-4 w-4" />
              Öppna karta
            </Button>
            <Button onClick={() => setExpanded('transport')}>
              <Truck className="mr-2 h-4 w-4" />
              Hantera transporter
            </Button>
          </div>
        </div>
      </header>

      <LogisticsOperationsOverview
        currentDate={weekViewDate}
        assignments={weekAssignments}
        bookingsWithoutTransport={withoutTransport}
        vehicles={vehicles}
        isLoading={isLoading || bookingsLoading || vehiclesLoading}
        onOpenTransport={() => setExpanded('transport')}
      />

      <LogisticsWeekView
        assignments={weekAssignments}
        isLoading={isLoading}
        currentDate={weekViewDate}
        onDateChange={setWeekViewDate}
        onEditAssignment={(assignment) => { setQuickEditAssignment(assignment); setQuickBookingId(assignment.booking_id); setQuickTransportOpen(true); }}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.4fr)]">
        <LogisticsUnplannedQueue
          currentDate={weekViewDate}
          bookings={withoutTransport}
          isLoading={bookingsLoading}
          onOpenTransport={() => setExpanded('transport')}
          onSelectBooking={(booking) => { setQuickEditAssignment(null); setQuickBookingId(booking.id); setQuickTransportOpen(true); }}
        />

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Map className="h-4 w-4 text-foreground" />
                <h2 className="text-sm font-bold text-foreground">Operativ karta</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Projekt och transporter i geografisk kontext. Öppna fullskärm för ruttarbete.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setExpanded('map')}>
              <Maximize2 className="mr-2 h-4 w-4" />
              Fullskärm
            </Button>
          </div>
          <div className="h-[420px] min-h-[360px]">
            <LogisticsMapWidget onClick={() => setExpanded('map')} highlightTarget={null} />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-muted/20 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Transportöversikt</h2>
              <p className="mt-1 text-xs text-muted-foreground">Befintlig transportvy, bevarad som fördjupning under den operativa översikten.</p>
            </div>
            <Badge variant="secondary" className="rounded-full">{activeVehicles.length} aktiva fordon/partners</Badge>
          </div>
        </div>
        <div className="p-4">
          <LogisticsTransportWidget
            onClick={() => setExpanded('transport')}
            assignments={assignments}
            isLoading={isLoading}
            dateMode={widgetDateMode}
            onDateModeChange={setWidgetDateMode}
            weekOffset={widgetWeekOffset}
            onWeekOffsetChange={setWidgetWeekOffset}
            monthOffset={widgetMonthOffset}
            onMonthOffsetChange={setWidgetMonthOffset}
            customRange={widgetCustomRange}
            onCustomRangeChange={setWidgetCustomRange}
          />
        </div>
      </section>

      {quickTransportOpen && (
        <QuickTransportDialog
          open={quickTransportOpen}
          onOpenChange={(open) => { setQuickTransportOpen(open); if (!open) { setQuickEditAssignment(null); setQuickBookingId(null); } }}
          bookings={bookings}
          vehicles={vehicles}
          assignment={quickEditAssignment}
          defaultBookingId={quickBookingId}
          onSaved={async () => { await refetchBookings(); }}
        />
      )}

      <Dialog open={expanded === 'transport'} onOpenChange={(open) => !open && setExpanded(null)}>
        <DialogContent className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden bg-card p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Transportplanering
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <TransportBookingTab vehicles={vehicles} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={expanded === 'map'} onOpenChange={(open) => !open && setExpanded(null)}>
        <DialogContent className="h-[95vh] w-[98vw] max-w-[98vw] overflow-hidden bg-card p-0">
          <LogisticsMapWidget onClick={() => setExpanded(null)} highlightTarget={null} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticsPlanning;
