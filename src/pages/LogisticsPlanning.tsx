import React, { useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { 
  Truck, 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Package, 
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Zap,
  Route,
  Calendar,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard, SimpleCard } from '@/components/ui/PremiumCard';
import { useVehicles } from '@/hooks/useVehicles';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import VehiclePartnerList from '@/components/logistics/VehiclePartnerList';

const LogisticsPlanning: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const { vehicles, activeVehicles, isLoading: vehiclesLoading, createVehicle, updateVehicle, deleteVehicle } = useVehicles();
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

  const isLoading = vehiclesLoading || assignmentsLoading;

  // Calculate stats
  const totalDeliveries = assignments.length;
  const completedDeliveries = assignments.filter(a => a.status === 'delivered').length;
  const inTransit = assignments.filter(a => a.status === 'in_transit').length;
  const pending = assignments.filter(a => a.status === 'pending').length;
  const completionRate = totalDeliveries > 0 ? Math.round((completedDeliveries / totalDeliveries) * 100) : 0;

  const getGpsStatus = (lastUpdate: string | null) => {
    if (!lastUpdate) return { color: 'bg-muted', label: 'Offline', online: false };
    const updateTime = new Date(lastUpdate);
    const minutesAgo = (Date.now() - updateTime.getTime()) / 60000;
    if (minutesAgo < 5) return { color: 'bg-emerald-500', label: 'Live', online: true };
    if (minutesAgo < 30) return { color: 'bg-amber-500', label: `${Math.round(minutesAgo)}m`, online: true };
    return { color: 'bg-destructive', label: 'Offline', online: false };
  };

  const getCapacityColor = (percentage: number) => {
    if (percentage > 100) return 'bg-destructive';
    if (percentage > 80) return 'bg-amber-500';
    return 'bg-primary';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case 'in_transit': return <Navigation className="h-3.5 w-3.5 text-blue-500 animate-pulse" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Truck}
        title="Transport Dashboard"
        subtitle={`Vecka ${format(currentDate, 'w', { locale: sv })} — ${format(selectedDate, 'EEEE d MMMM', { locale: sv })}`}
      >
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/vehicles')}
          className="rounded-xl"
        >
          <Truck className="h-4 w-4 mr-2" />
          Fordon
        </Button>
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/routes')}
          className="rounded-xl"
        >
          <Route className="h-4 w-4 mr-2" />
          Rutter
        </Button>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SimpleCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Totalt idag</p>
              <p className="text-2xl font-bold">{totalDeliveries}</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
          </div>
        </SimpleCard>
        
        <SimpleCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Levererade</p>
              <p className="text-2xl font-bold text-emerald-600">{completedDeliveries}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </SimpleCard>
        
        <SimpleCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">På väg</p>
              <p className="text-2xl font-bold text-blue-600">{inTransit}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10">
              <Navigation className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </SimpleCard>
        
        <SimpleCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Slutförandegrad</p>
              <p className="text-2xl font-bold">{completionRate}%</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </div>
          <Progress value={completionRate} className="h-1.5 mt-2" />
        </SimpleCard>
      </div>

      {/* Week Navigation */}
      <PremiumCard className="mb-6" noPadding>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => navigateWeek('prev')} 
              className="rounded-xl h-10 w-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex gap-2">
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);
                const dayAssignments = assignments.filter(a => {
                  // Simple date comparison - would need proper date field
                  return true; // Placeholder
                });
                
                return (
                  <Button
                    key={day.toISOString()}
                    variant={isSelected ? 'default' : 'ghost'}
                    className={cn(
                      "flex flex-col h-auto py-3 px-4 min-w-[72px] rounded-xl transition-all",
                      isSelected && "shadow-lg",
                      isTodayDate && !isSelected && "ring-2 ring-primary/30 bg-primary/5"
                    )}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span className={cn(
                      "text-xs font-medium uppercase tracking-wide",
                      isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {format(day, 'EEE', { locale: sv })}
                    </span>
                    <span className={cn(
                      "text-xl font-bold mt-0.5",
                      isSelected ? "text-primary-foreground" : "text-foreground"
                    )}>
                      {format(day, 'd')}
                    </span>
                    {isTodayDate && (
                      <span className={cn(
                        "text-[10px] mt-1 font-medium",
                        isSelected ? "text-primary-foreground/80" : "text-primary"
                      )}>
                        IDAG
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => navigateWeek('next')} 
              className="rounded-xl h-10 w-10"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </PremiumCard>

      {/* Vehicle & Partner List */}
      <VehiclePartnerList
        vehicles={vehicles}
        isLoading={vehiclesLoading}
        createVehicle={createVehicle}
        updateVehicle={updateVehicle}
        deleteVehicle={deleteVehicle}
      />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Vehicle Columns - takes 3 cols */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-muted/50 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : activeVehicles.length === 0 ? (
            <div /> 
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeVehicles.map(vehicle => {
                const vehicleAssignments = getAssignmentsByVehicle(vehicle.id);
                const { totalWeight, totalVolume } = getVehicleLoad(vehicle.id);
                const weightPercent = (totalWeight / vehicle.max_weight_kg) * 100;
                const volumePercent = (totalVolume / vehicle.max_volume_m3) * 100;
                const gpsStatus = getGpsStatus(vehicle.last_gps_update);
                const completedCount = vehicleAssignments.filter(a => a.status === 'delivered').length;

                return (
                  <div 
                    key={vehicle.id}
                    className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-all"
                  >
                    {/* Vehicle Header */}
                    <div className="p-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Truck className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{vehicle.name}</h3>
                            {vehicle.registration_number && (
                              <p className="text-xs text-muted-foreground">{vehicle.registration_number}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", gpsStatus.color)} />
                          <span className="text-xs text-muted-foreground">{gpsStatus.label}</span>
                        </div>
                      </div>
                      
                      {/* Progress summary */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {completedCount}/{vehicleAssignments.length} levererade
                        </span>
                        <Progress 
                          value={vehicleAssignments.length > 0 ? (completedCount / vehicleAssignments.length) * 100 : 0} 
                          className="h-1.5 flex-1"
                        />
                      </div>
                    </div>

                    {/* Assignments */}
                    <div className="p-4 space-y-2 min-h-[140px] max-h-[200px] overflow-y-auto">
                      {vehicleAssignments.length === 0 ? (
                        <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          Inga leveranser
                        </div>
                      ) : (
                        vehicleAssignments.map((assignment, idx) => (
                          <div 
                            key={assignment.id}
                            className={cn(
                              "p-3 rounded-xl border transition-all",
                              assignment.status === 'delivered' && "bg-emerald-50/50 border-emerald-200",
                              assignment.status === 'in_transit' && "bg-blue-50/50 border-blue-200 shadow-sm",
                              assignment.status === 'pending' && "bg-background border-border"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                assignment.status === 'delivered' 
                                  ? "bg-emerald-500 text-white" 
                                  : assignment.status === 'in_transit'
                                  ? "bg-blue-500 text-white"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {assignment.stop_order || idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {assignment.booking?.client || 'Okänd kund'}
                                </p>
                                {assignment.booking?.deliveryaddress && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {assignment.booking.deliveryaddress}
                                  </p>
                                )}
                              </div>
                              {getStatusIcon(assignment.status)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Capacity Footer */}
                    <div className="p-4 border-t border-border/50 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">Vikt</span>
                            <span className={cn(weightPercent > 100 && "text-destructive font-medium")}>
                              {Math.round(totalWeight)}/{vehicle.max_weight_kg}kg
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(weightPercent, 100)} 
                            className="h-1.5"
                            indicatorClassName={getCapacityColor(weightPercent)}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">Volym</span>
                            <span className={cn(volumePercent > 100 && "text-destructive font-medium")}>
                              {totalVolume.toFixed(1)}/{vehicle.max_volume_m3}m³
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(volumePercent, 100)} 
                            className="h-1.5"
                            indicatorClassName={getCapacityColor(volumePercent)}
                          />
                        </div>
                      </div>
                      
                      {vehicleAssignments.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full rounded-lg h-8 text-xs"
                          onClick={() => optimizeRoute(vehicle.id, format(selectedDate, 'yyyy-MM-dd'))}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Optimera rutt
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar - Unassigned + Quick Actions */}
        <div className="space-y-4">
          {/* Unassigned Bookings */}
          <PremiumCard
            icon={Package}
            title="Otilldelade"
            subtitle={format(selectedDate, 'd MMM', { locale: sv })}
            accentColor="amber"
          >
            <div className="space-y-2 min-h-[120px]">
              {pending === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/50" />
                  Alla leveranser tilldelade
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {pending} väntar på tilldelning
                </div>
              )}
            </div>
          </PremiumCard>

          {/* Quick Actions */}
          <PremiumCard title="Snabbåtgärder">
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start rounded-xl h-11"
                onClick={() => navigate('/logistics/routes')}
              >
                <Route className="h-4 w-4 mr-3 text-primary" />
                Visa alla rutter
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start rounded-xl h-11"
                onClick={() => navigate('/logistics/vehicles')}
              >
                <Truck className="h-4 w-4 mr-3 text-primary" />
                Hantera fordon
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start rounded-xl h-11"
              >
                <Calendar className="h-4 w-4 mr-3 text-primary" />
                Schemalägg transport
              </Button>
            </div>
          </PremiumCard>

          {/* Live Status */}
          <PremiumCard 
            title="Live-status" 
            accentColor="emerald"
          >
            <div className="space-y-3">
              {activeVehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Inga fordon att spåra
                </p>
              ) : (
                activeVehicles.slice(0, 3).map(vehicle => {
                  const gpsStatus = getGpsStatus(vehicle.last_gps_update);
                  return (
                    <div key={vehicle.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", gpsStatus.color)} />
                        <span className="text-sm font-medium">{vehicle.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {gpsStatus.label}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </PremiumCard>
        </div>
      </div>
    </PageContainer>
  );
};

export default LogisticsPlanning;
