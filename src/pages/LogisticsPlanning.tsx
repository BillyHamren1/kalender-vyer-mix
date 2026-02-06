import React, { useState } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Truck, ChevronLeft, ChevronRight, MapPin, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard, SimpleCard } from '@/components/ui/PremiumCard';
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
    
    if (minutesAgo < 5) return { color: 'bg-emerald-500', label: 'Live' };
    if (minutesAgo < 30) return { color: 'bg-amber-500', label: `${Math.round(minutesAgo)}m` };
    return { color: 'bg-destructive', label: 'Offline' };
  };

  const getCapacityColor = (percentage: number) => {
    if (percentage > 100) return 'bg-destructive';
    if (percentage > 80) return 'bg-amber-500';
    return 'bg-primary';
  };

  const isLoading = vehiclesLoading || assignmentsLoading;

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Truck}
        title="Transportplanering"
        subtitle="Planera och optimera leveranser"
      />

      {/* Week Navigation */}
      <PremiumCard className="mb-6" noPadding>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')} className="rounded-xl">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex gap-1">
              {weekDays.map(day => (
                <Button
                  key={day.toISOString()}
                  variant={isSameDay(day, selectedDate) ? 'default' : 'ghost'}
                  className={cn(
                    "flex flex-col h-auto py-2 px-3 min-w-[60px] rounded-xl",
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

            <Button variant="outline" size="icon" onClick={() => navigateWeek('next')} className="rounded-xl">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PremiumCard>

      {/* Vehicle Columns */}
      <div className="grid gap-4 mb-6" style={{ 
        gridTemplateColumns: `repeat(${Math.min(activeVehicles.length || 1, 4)}, minmax(280px, 1fr))` 
      }}>
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Laddar...
          </div>
        ) : activeVehicles.length === 0 ? (
          <PremiumCard icon={Truck} title="Inga fordon" className="col-span-full">
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Inga fordon registrerade ännu.
              </p>
              <Button onClick={() => window.location.href = '/logistics/vehicles'}>
                Lägg till fordon
              </Button>
            </div>
          </PremiumCard>
        ) : (
          activeVehicles.map(vehicle => {
            const vehicleAssignments = getAssignmentsByVehicle(vehicle.id);
            const { totalWeight, totalVolume } = getVehicleLoad(vehicle.id);
            const weightPercent = (totalWeight / vehicle.max_weight_kg) * 100;
            const volumePercent = (totalVolume / vehicle.max_volume_m3) * 100;
            const gpsStatus = getGpsStatus(vehicle.last_gps_update);

            return (
              <PremiumCard key={vehicle.id}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{vehicle.name}</h3>
                    {vehicle.registration_number && (
                      <p className="text-xs text-muted-foreground">{vehicle.registration_number}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full", gpsStatus.color)} />
                    {gpsStatus.label}
                  </Badge>
                </div>

                {/* Assignments */}
                <div className="space-y-2 min-h-[120px] mb-4">
                  {vehicleAssignments.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                      Inga bokningar
                    </div>
                  ) : (
                    vehicleAssignments.map((assignment, idx) => (
                      <SimpleCard key={assignment.id} className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                            {assignment.stop_order || idx + 1}
                          </span>
                          <span className="font-medium truncate flex-1 text-sm">
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
                      </SimpleCard>
                    ))
                  )}
                </div>

                {/* Capacity Bars */}
                <div className="space-y-2 pt-3 border-t">
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
                    className="w-full mt-3 rounded-xl"
                    onClick={() => optimizeRoute(vehicle.id, format(selectedDate, 'yyyy-MM-dd'))}
                  >
                    ⚡ Optimera rutt
                  </Button>
                )}
              </PremiumCard>
            );
          })
        )}
      </div>

      {/* Unassigned Bookings Section */}
      <PremiumCard
        icon={Package}
        title={`Otilldelade bokningar (${format(selectedDate, 'd MMM', { locale: sv })})`}
        accentColor="amber"
      >
        <div className="text-center py-6 text-sm text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Dra bekräftade bokningar hit för att tilldela till fordon
        </div>
      </PremiumCard>
    </PageContainer>
  );
};

export default LogisticsPlanning;
