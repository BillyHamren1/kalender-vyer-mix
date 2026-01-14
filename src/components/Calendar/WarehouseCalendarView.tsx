import React, { useState } from 'react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useWarehouseCalendarEvents, WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import { WarehouseEventCard, WarehouseEventDot } from './WarehouseEventCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Check, Eye } from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { WarehouseEventType, WAREHOUSE_EVENT_LABELS, WAREHOUSE_EVENT_COLORS } from '@/services/warehouseCalendarService';

interface WarehouseCalendarViewProps {
  currentDate: Date;
  view: 'day' | 'week' | 'month';
}

export function WarehouseCalendarView({ currentDate, view }: WarehouseCalendarViewProps) {
  const {
    events,
    eventsByDate,
    eventsWithChanges,
    changedEventsCount,
    loading,
    refetch,
    acknowledgeChange,
    markAsAdjusted
  } = useWarehouseCalendarEvents({ currentDate, view });

  const [selectedEvent, setSelectedEvent] = useState<WarehouseEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Generate days for the week view
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleEventClick = (event: WarehouseEvent) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  };

  const handleAcknowledge = async () => {
    if (selectedEvent) {
      await acknowledgeChange(selectedEvent.id);
      setDialogOpen(false);
      setSelectedEvent(null);
    }
  };

  const handleMarkAdjusted = async () => {
    if (selectedEvent) {
      await markAsAdjusted(selectedEvent.id);
      setDialogOpen(false);
      setSelectedEvent(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Changes alert banner */}
      {changedEventsCount > 0 && (
        <Card className="border-orange-500 bg-orange-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <span className="font-medium text-orange-800">
              {changedEventsCount} händelse(r) har ändrats i personalplaneringen
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-auto"
              onClick={() => {
                // Scroll to first changed event or show list
                const firstChanged = eventsWithChanges[0];
                if (firstChanged) {
                  handleEventClick(firstChanged);
                }
              }}
            >
              Visa ändringar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(WAREHOUSE_EVENT_LABELS) as WarehouseEventType[]).map(type => (
          <Badge 
            key={type} 
            variant="outline"
            style={{ backgroundColor: WAREHOUSE_EVENT_COLORS[type] }}
            className="text-xs"
          >
            {WAREHOUSE_EVENT_LABELS[type]}
          </Badge>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isToday = isSameDay(day, new Date());

          return (
            <Card 
              key={dateKey} 
              className={cn(
                "min-h-[300px]",
                isToday && "ring-2 ring-primary"
              )}
            >
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium">
                  <span className="text-muted-foreground">
                    {format(day, 'EEEE', { locale: sv })}
                  </span>
                  <br />
                  <span className={cn(
                    "text-lg",
                    isToday && "text-primary font-bold"
                  )}>
                    {format(day, 'd MMM', { locale: sv })}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 py-1 space-y-1">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Inga händelser
                  </p>
                ) : (
                  dayEvents.map(event => (
                    <WarehouseEventCard
                      key={event.id}
                      event={event}
                      onClick={() => handleEventClick(event)}
                      compact={true}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Event detail/change dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent?.has_source_changes && (
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              )}
              {selectedEvent?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedEvent && (
                <div className="space-y-2 mt-2">
                  <div>
                    <span className="font-medium">Typ: </span>
                    {WAREHOUSE_EVENT_LABELS[selectedEvent.event_type as WarehouseEventType]}
                  </div>
                  <div>
                    <span className="font-medium">Tid: </span>
                    {format(new Date(selectedEvent.start_time), 'HH:mm')} - {format(new Date(selectedEvent.end_time), 'HH:mm')}
                  </div>
                  <div>
                    <span className="font-medium">Datum: </span>
                    {format(new Date(selectedEvent.start_time), 'EEEE d MMMM yyyy', { locale: sv })}
                  </div>
                  {selectedEvent.booking_number && (
                    <div>
                      <span className="font-medium">Bokningsnr: </span>
                      #{selectedEvent.booking_number}
                    </div>
                  )}
                  {selectedEvent.delivery_address && (
                    <div>
                      <span className="font-medium">Adress: </span>
                      {selectedEvent.delivery_address}
                    </div>
                  )}
                  
                  {/* Change details */}
                  {selectedEvent.has_source_changes && selectedEvent.change_details && (
                    <div className="mt-4 p-3 bg-orange-100 rounded-lg border border-orange-300">
                      <div className="font-medium text-orange-800 mb-1">
                        ⚠️ Ändring från personalplanering:
                      </div>
                      <div className="text-orange-700">
                        {selectedEvent.change_details}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {selectedEvent?.has_source_changes ? (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Stäng
                </Button>
                <Button variant="secondary" onClick={handleAcknowledge}>
                  <Eye className="w-4 h-4 mr-2" />
                  Markera som sedd
                </Button>
                <Button onClick={handleMarkAdjusted}>
                  <Check className="w-4 h-4 mr-2" />
                  Markera som hanterad
                </Button>
              </>
            ) : (
              <Button onClick={() => setDialogOpen(false)}>Stäng</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
