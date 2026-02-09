import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Maximize2, Truck, CalendarIcon, MapPin, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTransportAssignments, TransportAssignment } from '@/hooks/useTransportAssignments';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, addWeeks, subWeeks, addMonths, subMonths, isToday, isTomorrow, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';

type DateMode = 'week' | 'month' | 'custom';

interface Props {
  onClick: () => void;
  vehicles: any[];
  onShowRoute?: (assignmentId: string) => void;
}

const TransportCard = ({ a, vehicles, navigate }: { a: TransportAssignment; vehicles: any[]; navigate: (path: string) => void }) => {
  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find(v => v.id === vehicleId);
    return v?.name || v?.registration_number || 'Okänt fordon';
  };

  const getStatusBadge = (a: TransportAssignment) => {
    if (a.status === 'delivered') return <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Levererad</Badge>;
    if (a.partner_response === 'accepted') return <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Bekräftad</Badge>;
    if (a.partner_response === 'declined') return <Badge className="bg-destructive/15 text-destructive border-0 text-[10px]">Nekad</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px]">Väntar</Badge>;
  };

  const formatTransportDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) return 'Idag';
      if (isTomorrow(d)) return 'Imorgon';
      return format(d, 'EEE d MMM', { locale: sv });
    } catch { return dateStr; }
  };

  return (
    <div
      className="rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer p-2.5"
      onClick={() => a.booking_id && navigate(`/booking/${a.booking_id}`)}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold truncate">{a.booking?.client || 'Okänd kund'}</span>
            {getStatusBadge(a)}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span>{formatTransportDate(a.transport_date)}</span>
            <span>·</span>
            <span className="truncate flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5 inline" />
              {(a.booking as any)?.deliveryaddress || '–'}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{getVehicleName(a.vehicle_id)}</p>
        </div>
      </div>
    </div>
  );
};

const LogisticsTransportWidget: React.FC<Props> = ({ onClick, vehicles }) => {
  const navigate = useNavigate();
  const [dateMode, setDateMode] = useState<DateMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const now = new Date();

  const getRange = () => {
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
  };

  const range = getRange();
  const { assignments, isLoading } = useTransportAssignments(range.start, range.end);

  // Split into three columns
  const actionRequired = assignments.filter(a => 
    a.partner_response === 'declined' || 
    (!a.status || a.status === 'pending') && !a.partner_response && !a.vehicle_id
  );
  const waitingResponse = assignments.filter(a => 
    a.status === 'pending' && a.partner_response !== 'accepted' && a.partner_response !== 'declined'
  );
  const confirmed = assignments.filter(a => 
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

  const navigatePrev = () => {
    if (dateMode === 'week') setWeekOffset(p => p - 1);
    if (dateMode === 'month') setMonthOffset(p => p - 1);
  };
  const navigateNext = () => {
    if (dateMode === 'week') setWeekOffset(p => p + 1);
    if (dateMode === 'month') setMonthOffset(p => p + 1);
  };
  const navigateToday = () => {
    setWeekOffset(0);
    setMonthOffset(0);
  };

  const columns = [
    {
      title: 'Åtgärd krävs',
      icon: AlertTriangle,
      items: actionRequired,
      color: 'text-destructive',
      bgColor: 'bg-destructive/5',
      borderColor: 'border-destructive/20',
    },
    {
      title: 'Väntar svar',
      icon: Clock,
      items: waitingResponse,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20',
    },
    {
      title: 'Bekräftat',
      icon: CheckCircle2,
      items: confirmed,
      color: 'text-primary',
      bgColor: 'bg-primary/5',
      borderColor: 'border-primary/20',
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

        {/* Date controls */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex gap-1">
            {(['week', 'month', 'custom'] as DateMode[]).map(mode => (
              <Button
                key={mode}
                variant={dateMode === mode ? 'default' : 'secondary'}
                size="sm"
                className={cn("h-6 text-[10px] px-2 rounded-md", dateMode !== mode && "bg-muted/50")}
                onClick={() => setDateMode(mode)}
              >
                {mode === 'week' ? 'Vecka' : mode === 'month' ? 'Månad' : 'Anpassad'}
              </Button>
            ))}
          </div>

          {dateMode !== 'custom' && (
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={navigatePrev}>←</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={navigateToday}>Idag</Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={navigateNext}>→</Button>
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
                    if (range?.from && range?.to) setCustomRange({ from: range.from, to: range.to });
                    else if (range?.from) setCustomRange({ from: range.from, to: range.from });
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
                      <TransportCard key={a.id} a={a} vehicles={vehicles} navigate={navigate} />
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
