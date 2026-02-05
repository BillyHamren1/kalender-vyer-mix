import React, { useState } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Truck, ChevronLeft, ChevronRight, MapPin, Package, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useVehicles } from '@/hooks/useVehicles';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';

const LogisticsPlanning: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const { vehicles, activeVehicles, isLoading: vehiclesLoading } = useVehicles();
  const { 
    assignments, 
    getAssignmentsByVehicle, 
    getVehicleLoad,
    optimizeRoute,
    isLoading: assignmentsLoading 
  } = useTransportAssignments(selectedDate);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  };

  const getGpsStatus = (lastUpdate: string | null) => {
    if (!lastUpdate) return { color: 'bg-muted', label: 'Ingen GPS' };
    
    const updateTime = new Date(lastUpdate);
    const minutesAgo = (Date.now() - updateTime.getTime()) / 60000;
    
    if (minutesAgo < 5) return { color: 'bg-green-500', label: 'Live' };
    if (minutesAgo < 30) return { color: 'bg-yellow-500', label: `${Math.round(minutesAgo)}m` };
    return { color: 'bg-red-500', label: 'Offline' };
  };

  const getCapacityColor = (percentage: number) => {
    if (percentage > 100) return 'bg-destructive';
    if (percentage > 80) return 'bg-yellow-500';
    return 'bg-primary';
  };

  const isLoading = vehiclesLoading || assignmentsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Transportplanering
          </h1>
          <p className="text-muted-foreground">
            Planera och optimera leveranser
          </p>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex gap-1">
              {weekDays.map(day => (
                <Button
                  key={day.toISOString()}
                  variant={isSameDay(day, selectedDate) ? 'default' : 'ghost'}
                  className={cn(
                    "flex flex-col h-auto py-2 px-3 min-w-[60px]",
                    isSameDay(day, new Date()) && !isSameDay(day, selectedDate) && "ring-2 ring-primary/30"
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className="text-xs font-normal">
                    {format(day, 'EEE', { locale: sv })}
                  </span>
                  <span className="text-lg font-bold">
                    {format(day, 'd')}
                  </span>
                </Button>
              ))}
            </div>

            <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vehicle Columns */}
      <div className="grid gap-4" style={{ 
        gridTemplateColumns: `repeat(${Math.min(activeVehicles.length || 1, 4)}, minmax(280px, 1fr))` 
      }}>
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Laddar...
          </div>
        ) : activeVehicles.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center">
              <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Inga fordon registrerade ännu.
              </p>
              <Button className="mt-4" onClick={() => window.location.href = '/logistics/vehicles'}>
                Lägg till fordon
              </Button>
            </CardContent>
          </Card>
        ) : (
          activeVehicles.map(vehicle => {
            const vehicleAssignments = getAssignmentsByVehicle(vehicle.id);
            const { totalWeight, totalVolume } = getVehicleLoad(vehicle.id);
            const weightPercent = (totalWeight / vehicle.max_weight_kg) * 100;
            const volumePercent = (totalVolume / vehicle.max_volume_m3) * 100;
            const gpsStatus = getGpsStatus(vehicle.last_gps_update);

            return (
              <Card key={vehicle.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      {vehicle.name}
                    </CardTitle>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <div className={cn("w-2 h-2 rounded-full", gpsStatus.color)} />
                      {gpsStatus.label}
                    </Badge>
                  </div>
                  {vehicle.registration_number && (
                    <p className="text-xs text-muted-foreground">{vehicle.registration_number}</p>
                  )}
                </CardHeader>

                <CardContent className="flex-1 space-y-3">
                  {/* Assignments */}
                  <div className="space-y-2 min-h-[120px]">
                    {vehicleAssignments.length === 0 ? (
                      <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                        Inga bokningar
                      </div>
                    ) : (
                      vehicleAssignments.map((assignment, idx) => (
                        <div
                          key={assignment.id}
                          className="p-2 bg-muted/50 rounded-lg border text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                              {assignment.stop_order || idx + 1}
                            </span>
                            <span className="font-medium truncate flex-1">
                              {assignment.booking?.client || 'Okänd kund'}
                            </span>
                            <Badge 
                              variant={assignment.status === 'delivered' ? 'default' : 'secondary'}
                              className="text-[10px] px-1"
                            >
                              {assignment.status === 'delivered' ? '✓' : 
                               assignment.status === 'in_transit' ? '→' : '○'}
                            </Badge>
                          </div>
                          {assignment.booking?.deliveryaddress && (
                            <p className="text-xs text-muted-foreground mt-1 pl-7 truncate">
                              <MapPin className="inline h-3 w-3 mr-1" />
                              {assignment.booking.deliveryaddress}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Capacity Bars */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Vikt</span>
                        <span className={cn(
                          weightPercent > 100 && "text-destructive font-medium"
                        )}>
                          {Math.round(totalWeight)} / {vehicle.max_weight_kg} kg
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(weightPercent, 100)} 
                        className="h-2"
                        indicatorClassName={getCapacityColor(weightPercent)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Volym</span>
                        <span className={cn(
                          volumePercent > 100 && "text-destructive font-medium"
                        )}>
                          {totalVolume.toFixed(1)} / {vehicle.max_volume_m3} m³
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(volumePercent, 100)} 
                        className="h-2"
                        indicatorClassName={getCapacityColor(volumePercent)}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  {vehicleAssignments.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => optimizeRoute(vehicle.id, format(selectedDate, 'yyyy-MM-dd'))}
                    >
                      ⚡ Optimera rutt
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Unassigned Bookings Section - Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Otilldelade bokningar ({format(selectedDate, 'd MMM', { locale: sv })})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Dra bekräftade bokningar hit för att tilldela till fordon
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogisticsPlanning;
