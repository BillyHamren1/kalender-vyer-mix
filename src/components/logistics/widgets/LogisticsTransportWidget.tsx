import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Maximize2, Clock, Check, Truck, CalendarIcon, ChevronDown, ChevronRight, MapPin, Navigation } from 'lucide-react';
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
type StatusFilter = 'all' | 'pending' | 'confirmed' | 'delivered';

interface Props {
  onClick: () => void;
  vehicles: any[];
  onShowRoute?: (assignmentId: string) => void;
}

const LogisticsTransportWidget: React.FC<Props> = ({ onClick, vehicles, onShowRoute }) => {
  const navigate = useNavigate();
  const [dateMode, setDateMode] = useState<DateMode>('week');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const now = new Date();

  // Calculate date range based on mode
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

  // Filter by status
  const filtered = assignments.filter(a => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return a.status === 'pending' && a.partner_response !== 'accepted';
    if (statusFilter === 'confirmed') return a.partner_response === 'accepted';
    if (statusFilter === 'delivered') return a.status === 'delivered';
    return true;
  });

  // Stats
  const pending = assignments.filter(a => a.status === 'pending' && a.partner_response !== 'accepted');
  const confirmed = assignments.filter(a => a.partner_response === 'accepted');
  const delivered = assignments.filter(a => a.status === 'delivered');

  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find(v => v.id === vehicleId);
    return v?.name || v?.registration_number || 'Okänt fordon';
  };

  const getStatusBadge = (a: TransportAssignment) => {
    if (a.status === 'delivered') return <Badge className="bg-green-500/15 text-green-600 border-0 text-[10px]">Levererad</Badge>;
    if (a.partner_response === 'accepted') return <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Bekräftad</Badge>;
    if (a.partner_response === 'declined') return <Badge className="bg-destructive/15 text-destructive border-0 text-[10px]">Nekad</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px]">Väntar</Badge>;
  };

  const formatDateLabel = () => {
    if (dateMode === 'week') {
      return `v${format(range.start, 'w', { locale: sv })} · ${format(range.start, 'd MMM', { locale: sv })} – ${format(range.end, 'd MMM', { locale: sv })}`;
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

  const formatTransportDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) return 'Idag';
      if (isTomorrow(d)) return 'Imorgon';
      return format(d, 'EEE d MMM', { locale: sv });
    } catch { return dateStr; }
  };

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden flex flex-col h-full">
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
          {/* Mode toggles */}
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

          {/* Navigation */}
          {dateMode !== 'custom' && (
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={navigatePrev}>←</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={navigateToday}>Idag</Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={navigateNext}>→</Button>
            </div>
          )}

          {/* Custom date picker */}
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

        {/* Period label */}
        <p className="text-[11px] text-muted-foreground mt-1 capitalize">{formatDateLabel()}</p>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { key: 'all' as StatusFilter, label: 'Alla', count: assignments.length, color: 'text-foreground' },
            { key: 'pending' as StatusFilter, label: 'Väntar', count: pending.length, color: 'text-amber-500' },
            { key: 'confirmed' as StatusFilter, label: 'Bekräftad', count: confirmed.length, color: 'text-primary' },
            { key: 'delivered' as StatusFilter, label: 'Levererad', count: delivered.length, color: 'text-green-500' },
          ].map(s => (
            <button
              key={s.key}
              onClick={(e) => { e.stopPropagation(); setStatusFilter(s.key); }}
              className={cn(
                "text-center p-2 rounded-lg transition-colors",
                statusFilter === s.key ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/50"
              )}
            >
              <p className={cn("text-lg font-bold", s.color)}>{s.count}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Booking list */}
        <div className="space-y-1.5 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Laddar...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Inga transporter för perioden</p>
          ) : (
            filtered.map(a => (
              <div
                key={a.id}
                className={cn(
                  "rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer",
                  expandedId === a.id && "bg-muted/40 ring-1 ring-primary/20"
                )}
                onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
              >
                <div className="flex items-center gap-3 p-2.5">
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
                        {(a.booking as any)?.deliveryaddress || (a.booking as any)?.delivery_city || '–'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{getVehicleName(a.vehicle_id)}</p>
                  </div>
                  {expandedId === a.id ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </div>

                {/* Expanded details */}
                {expandedId === a.id && (
                  <div className="px-2.5 pb-2.5 pt-0 border-t border-border/30 mt-1">
                    <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Hämtadress</p>
                        <p className="font-medium">{a.pickup_address || 'Ej angiven'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Leveransadress</p>
                        <p className="font-medium">{(a.booking as any)?.deliveryaddress || '–'}</p>
                      </div>
                      {a.driver_notes && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Förarkommentar</p>
                          <p className="font-medium">{a.driver_notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1 rounded-lg flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowRoute?.(a.id);
                        }}
                      >
                        <Navigation className="w-3 h-3" />
                        Visa rutt
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1 rounded-lg flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClick();
                        }}
                      >
                        <Maximize2 className="w-3 h-3" />
                        Fullvy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsTransportWidget;
