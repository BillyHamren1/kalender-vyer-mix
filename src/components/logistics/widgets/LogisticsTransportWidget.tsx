import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Maximize2, Truck, CalendarIcon, MapPin, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TransportAssignment } from '@/hooks/useTransportAssignments';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, addWeeks, subWeeks, addMonths, subMonths, isToday, isTomorrow, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type DateMode = 'week' | 'month' | 'custom';

interface Props {
  onClick: () => void;
  assignments: TransportAssignment[];
  isLoading: boolean;
  dateMode: DateMode;
  onDateModeChange: (mode: DateMode) => void;
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  monthOffset: number;
  onMonthOffsetChange: (offset: number) => void;
  customRange: { from: Date; to: Date } | null;
  onCustomRangeChange: (range: { from: Date; to: Date } | null) => void;
}

export const TransportCard = ({ a, expandedId, setExpandedId, cardBg, cardBorder }: { 
  a: TransportAssignment; 
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  cardBg: string;
  cardBorder: string;
}) => {
  const isExpanded = expandedId === a.id;

  const getStatusBadge = (a: TransportAssignment) => {
    if (a.status === 'delivered') return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[10px]">Levererad</Badge>;
    if (a.partner_response === 'accepted') return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[10px]">Bekräftad</Badge>;
    if (a.partner_response === 'declined') return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Nekad</Badge>;
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Väntar</Badge>;
  };

  const products = a.booking?.booking_products || [];
  const totalWeight = products.reduce((sum, p) => sum + (p.estimated_weight_kg || 0) * p.quantity, 0);
  const totalVolume = products.reduce((sum, p) => sum + (p.estimated_volume_m3 || 0) * p.quantity, 0);
  const assignmentAny = a as any;

  const statusLabel = a.status === 'delivered' ? 'Levererad' :
    a.partner_response === 'accepted' ? 'Accepterad' :
    a.partner_response === 'declined' ? 'Nekad' : 'Väntar';

  const statusDot = a.status === 'delivered' ? 'bg-primary' :
    a.partner_response === 'accepted' ? 'bg-primary' :
    a.partner_response === 'declined' ? 'bg-destructive' :
    'bg-muted-foreground';

  return (
    <div
      className={cn(
        `rounded-lg ${cardBg} border ${cardBorder} shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden`,
        isExpanded && "ring-1 ring-primary/30"
      )}
      onClick={() => setExpandedId(isExpanded ? null : a.id)}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-teal-50 text-teal-700 border-teal-200">
            TRANSPORT
          </span>
          <Truck className="w-3.5 h-3.5 ml-auto text-primary/60" />
        </div>

        <h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1">
          {a.booking?.client || 'Okänd kund'}
        </h4>

        <div className="flex items-start gap-1.5 mb-1">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs text-muted-foreground line-clamp-1">
            {(a.booking as any)?.deliveryaddress || '–'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", statusDot)} />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/30 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs">
            <div>
              <p className="text-muted-foreground text-[10px]">Fordon</p>
              <p className="font-medium">{a.vehicle?.name || 'Okänt fordon'}</p>
            </div>
            {a.vehicle?.is_external && (
              <div>
                <p className="text-muted-foreground text-[10px]">Typ</p>
                <p className="font-medium">Extern partner</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-[10px]">Hämtadress</p>
              <p className="font-medium">{a.pickup_address || 'Ej angiven'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Leveransadress</p>
              <p className="font-medium">{(a.booking as any)?.deliveryaddress || '–'}</p>
            </div>
            {assignmentAny.transport_time && (
              <div>
                <p className="text-muted-foreground text-[10px]">Tid</p>
                <p className="font-medium">{assignmentAny.transport_time}</p>
              </div>
            )}
            {assignmentAny.estimated_duration && (
              <div>
                <p className="text-muted-foreground text-[10px]">Uppskattad tid</p>
                <p className="font-medium">{assignmentAny.estimated_duration} min</p>
              </div>
            )}
            {totalWeight > 0 && (
              <div>
                <p className="text-muted-foreground text-[10px]">Totalvikt</p>
                <p className="font-medium">{totalWeight.toLocaleString('sv')} kg</p>
              </div>
            )}
            {totalVolume > 0 && (
              <div>
                <p className="text-muted-foreground text-[10px]">Totalvolym</p>
                <p className="font-medium">{totalVolume.toFixed(1)} m³</p>
              </div>
            )}
          </div>
          {a.driver_notes && (
            <div className="text-xs">
              <p className="text-muted-foreground text-[10px]">Förarkommentar</p>
              <p className="font-medium">{a.driver_notes}</p>
            </div>
          )}
          {products.length > 0 && (
            <div className="text-xs">
              <p className="text-muted-foreground text-[10px] mb-1">Produkter</p>
              <div className="space-y-0.5">
                {products.map((p, i) => (
                  <p key={i} className="font-medium">{p.quantity}x {p.name}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const LogisticsTransportWidget: React.FC<Props> = ({
  onClick,
  assignments,
  isLoading,
  dateMode,
  onDateModeChange,
  weekOffset,
  onWeekOffsetChange,
  monthOffset,
  onMonthOffsetChange,
  customRange,
  onCustomRangeChange,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const now = new Date();

  // Compute the widget's date range for filtering
  const range = useMemo(() => {
    if (dateMode === 'week') {
      const base = weekOffset === 0 ? now : (weekOffset > 0 ? addWeeks(now, weekOffset) : subWeeks(now, Math.abs(weekOffset)));
      return { start: startOfWeek(base, { weekStartsOn: 1 }), end: endOfWeek(base, { weekStartsOn: 1 }) };
    }
    if (dateMode === 'month') {
      const base = monthOffset === 0 ? now : (monthOffset > 0 ? addMonths(now, monthOffset) : subMonths(now, Math.abs(monthOffset)));
      return { start: startOfMonth(base), end: endOfMonth(base) };
    }
    if (customRange) {
      return { start: customRange.from, end: customRange.to };
    }
    return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  }, [dateMode, weekOffset, monthOffset, customRange]);

  // Filter shared assignments to this widget's range
  const filteredAssignments = useMemo(() => {
    const startStr = format(range.start, 'yyyy-MM-dd');
    const endStr = format(range.end, 'yyyy-MM-dd');
    return assignments.filter(a => a.transport_date >= startStr && a.transport_date <= endStr);
  }, [assignments, range]);

  const actionRequired = filteredAssignments.filter(a => 
    a.partner_response === 'declined' || 
    (!a.status || a.status === 'pending') && !a.partner_response && !a.vehicle_id
  );
  const waitingResponse = filteredAssignments.filter(a => 
    a.status === 'pending' && a.partner_response !== 'accepted' && a.partner_response !== 'declined'
  );
  const confirmed = filteredAssignments.filter(a => 
    a.partner_response === 'accepted' || a.status === 'delivered'
  );

  const formatDateLabel = () => {
    if (dateMode === 'week') {
      return `V${format(range.start, 'w', { locale: sv })} · ${format(range.start, 'd MMM', { locale: sv })} – ${format(range.end, 'd MMM', { locale: sv })}`;
    }
    if (dateMode === 'month') {
      return format(range.start, 'MMMM yyyy', { locale: sv });
    }
    if (customRange) {
      return `${format(customRange.from, 'd MMM', { locale: sv })} – ${format(customRange.to, 'd MMM', { locale: sv })}`;
    }
    return '';
  };

  const columns = [
    {
      title: 'Åtgärd krävs',
      icon: AlertTriangle,
      items: actionRequired,
      color: 'text-destructive',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-red-50',
      cardBorder: 'border-red-200',
    },
    {
      title: 'Väntar svar',
      icon: Clock,
      items: waitingResponse,
      color: 'text-amber-500',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-amber-50',
      cardBorder: 'border-amber-200',
    },
    {
      title: 'Bekräftat',
      icon: CheckCircle2,
      items: confirmed,
      color: 'text-primary',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-teal-50',
      cardBorder: 'border-teal-200',
    },
  ];

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Transportbokningar
          </div>
          <button onClick={onClick}>
            <Maximize2 className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
        </CardTitle>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex gap-1">
            {(['week', 'month', 'custom'] as DateMode[]).map(mode => (
              <Button
                key={mode}
                variant={dateMode === mode ? 'default' : 'secondary'}
                size="sm"
                className={cn("h-6 text-[10px] px-2 rounded-md", dateMode !== mode && "bg-muted/50")}
                onClick={() => onDateModeChange(mode)}
              >
                {mode === 'week' ? 'Vecka' : mode === 'month' ? 'Månad' : 'Anpassad'}
              </Button>
            ))}
          </div>

          {dateMode !== 'custom' && (
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={() => dateMode === 'week' ? onWeekOffsetChange(weekOffset - 1) : onMonthOffsetChange(monthOffset - 1)}>←</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => { onWeekOffsetChange(0); onMonthOffsetChange(0); }}>Idag</Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={() => dateMode === 'week' ? onWeekOffsetChange(weekOffset + 1) : onMonthOffsetChange(monthOffset + 1)}>→</Button>
            </div>
          )}

          {dateMode === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 ml-auto gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {customRange ? `${format(customRange.from, 'd/M')} – ${format(customRange.to, 'd/M')}` : 'Välj datum'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                  onSelect={(range) => {
                    if (range?.from && range?.to) onCustomRangeChange({ from: range.from, to: range.to });
                    else if (range?.from) onCustomRangeChange({ from: range.from, to: range.from });
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-1 capitalize">{formatDateLabel()}</p>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Laddar...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {columns.map(col => (
              <div key={col.title} className={cn("rounded-xl border p-3", col.bgColor, col.borderColor)}>
                <div className="flex items-center gap-2 mb-3">
                  <col.icon className={cn("w-4 h-4", col.color)} />
                  <h3 className={cn("text-xs font-semibold", col.color)}>{col.title}</h3>
                  <span className={cn("ml-auto text-sm font-bold", col.color)}>{col.items.length}</span>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {col.items.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-6">Inga transporter</p>
                  ) : (
                    col.items.map(a => (
                      <TransportCard key={a.id} a={a} expandedId={expandedId} setExpandedId={setExpandedId} cardBg={col.cardBg} cardBorder={col.cardBorder} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LogisticsTransportWidget;
